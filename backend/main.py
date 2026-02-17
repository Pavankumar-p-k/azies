from __future__ import annotations

import re
import uuid
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.hasher import generate_hash
from core.models import HealthResponse, ProofResponse, VerifyResponse
from core.p2p_node import ConnectionManager, PeerBroadcaster
from core.pqc_engine import PQCEngine
from core.settings import Settings, get_settings
from core.supabase_repo import SupabaseRepository
from core.vault import VaultCipher


def _clean_filename(name: str) -> str:
    base = name.strip() or "unnamed"
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", base)


settings = get_settings()
repository = SupabaseRepository(settings)
pqc_engine = PQCEngine(algorithm=settings.pqc_algorithm)
vault = VaultCipher(settings.vault_master_key)
peer_broadcaster = PeerBroadcaster(settings.p2p_peers_list)
ws_manager = ConnectionManager()

auth_scheme = HTTPBearer(auto_error=False)

app = FastAPI(title=settings.app_name, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def resolve_owner_email(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
) -> str:
    default_email = "anonymous@aegis.local"
    if not credentials:
        return default_email
    if not repository.enabled:
        return default_email
    email = repository.get_user_email_from_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    return email


@app.get("/")
def index() -> dict:
    return {"name": settings.app_name, "docs": "/docs", "api_prefix": settings.api_prefix}


@app.get(f"{settings.api_prefix}/health", response_model=HealthResponse)
def health() -> HealthResponse:
    info = pqc_engine.info
    return HealthResponse(
        status="ok",
        environment=settings.app_env,
        pqc_algorithm=info.algorithm,
        pqc_backend=info.backend,
        pqc_fallback_active=info.fallback_active,
        supabase_enabled=repository.enabled,
    )


@app.post(f"{settings.api_prefix}/proofs/upload", response_model=ProofResponse)
async def upload_and_sign_file(
    file: UploadFile = File(...),
    owner_email: str = Depends(resolve_owner_email),
) -> ProofResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    hash_value = generate_hash(content)
    signature = pqc_engine.sign_hash(hash_value)
    signature_b64 = pqc_engine.encode_signature_b64(signature)

    signature_valid = pqc_engine.verify_hash(signature, hash_value)
    status = "VERIFIED" if signature_valid else "TAMPERED"
    verification_id = str(uuid.uuid4())
    clean_name = _clean_filename(file.filename or "unnamed")

    encrypted = vault.encrypt(content)
    storage_path = f"{owner_email}/{verification_id}-{clean_name}.aegis"
    repository.upload_vault_blob(storage_path, encrypted.payload)

    proof = {
        "verification_id": verification_id,
        "filename": clean_name,
        "size_bytes": len(content),
        "hash_sha3_512": hash_value,
        "signature_b64": signature_b64,
        "public_key_b64": pqc_engine.export_public_key_b64(),
        "pqc_algorithm": pqc_engine.info.algorithm,
        "pqc_backend": pqc_engine.info.backend,
        "status": status,
        "owner_email": owner_email,
        "storage_path": storage_path,
        "vault_nonce_b64": encrypted.nonce_b64,
        "vault_key_fingerprint": encrypted.key_fingerprint,
        "created_at": repository.now_iso(),
    }
    repository.insert_proof(proof)

    event_payload = {
        "verification_id": verification_id,
        "filename": clean_name,
        "owner_email": owner_email,
        "status": status,
        "created_at": proof["created_at"],
    }
    await ws_manager.broadcast("proof_created", event_payload)
    await peer_broadcaster.broadcast_integrity_proof(event_payload)

    return ProofResponse(
        verification_id=verification_id,
        filename=clean_name,
        size_bytes=len(content),
        hash_sha3_512=hash_value,
        signature_b64=signature_b64,
        public_key_b64=proof["public_key_b64"],
        pqc_algorithm=proof["pqc_algorithm"],
        status=status,
        owner_email=owner_email,
        created_at=proof["created_at"],
    )


@app.post(
    f"{settings.api_prefix}/proofs/{{verification_id}}/verify",
    response_model=VerifyResponse,
)
async def verify_proof(
    verification_id: str,
    file: UploadFile | None = File(default=None),
    owner_email: str = Depends(resolve_owner_email),
) -> VerifyResponse:
    proof = repository.get_proof(verification_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Verification ID not found.")

    if repository.enabled and proof.get("owner_email") != owner_email:
        raise HTTPException(status_code=403, detail="You do not own this verification proof.")

    signature_valid = pqc_engine.verify_hash_with_public_key(
        signature=pqc_engine.decode_signature_b64(proof["signature_b64"]),
        hash_value=proof["hash_sha3_512"],
        public_key_b64=proof["public_key_b64"],
    )
    file_hash_match: bool | None = None
    detail = "Signature matches ledger hash."

    if file is not None:
        candidate_content = await file.read()
        candidate_hash = generate_hash(candidate_content)
        file_hash_match = candidate_hash == proof["hash_sha3_512"]
        detail = (
            "Signature valid and uploaded file hash matches."
            if file_hash_match and signature_valid
            else "Uploaded file hash does not match original proof."
        )

    status = "VERIFIED"
    if not signature_valid or file_hash_match is False:
        status = "TAMPERED"

    await ws_manager.broadcast(
        "proof_verified",
        {
            "verification_id": verification_id,
            "status": status,
            "signature_valid": signature_valid,
            "file_hash_match": file_hash_match,
        },
    )

    return VerifyResponse(
        verification_id=verification_id,
        status=status,
        signature_valid=signature_valid,
        file_hash_match=file_hash_match,
        detail=detail,
    )


@app.get(f"{settings.api_prefix}/proofs")
def list_proofs(
    limit: int = Query(default=50, ge=1, le=200),
    owner_email: str = Depends(resolve_owner_email),
) -> dict:
    rows = repository.list_proofs(owner_email if repository.enabled else None, limit=limit)
    return {"items": rows, "count": len(rows)}


@app.websocket("/ws/proofs")
async def proofs_socket(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and allow clients to send ping payloads.
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)
