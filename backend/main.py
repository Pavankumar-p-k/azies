from __future__ import annotations

import re
import secrets
import uuid
from typing import Any, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.hasher import generate_hash
from core.models import (
    DeleteProofResponse,
    HealthResponse,
    NotificationItem,
    NotificationsResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    ProofResponse,
    SharedProofResponse,
    SharedVerifyResponse,
    ShareLinkResponse,
    VerifyResponse,
)
from core.p2p_node import ConnectionManager, PeerBroadcaster
from core.pqc_engine import PQCEngine
from core.settings import Settings, get_settings
from core.supabase_repo import SupabaseRepository
from core.vault import VaultCipher


def _clean_filename(name: str) -> str:
    base = name.strip() or "unnamed"
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", base)


def _clean_handle(value: str) -> str:
    candidate = value.strip().lower()
    candidate = re.sub(r"[^a-z0-9_.-]+", "", candidate)
    return candidate.strip("._-")


def _mask_owner_email(email: str) -> str:
    if "@" not in email:
        return "hidden"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "*" if local else "*"
    else:
        masked_local = local[:2] + "*" * (len(local) - 2)
    return f"{masked_local}@{domain}"


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


async def resolve_user_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme),
) -> dict[str, Any]:
    default_email = "anonymous@aegis.local"
    if not credentials:
        return {"id": None, "email": default_email, "is_authenticated": False}
    if not repository.enabled:
        return {"id": None, "email": default_email, "is_authenticated": False}
    user = repository.get_user_from_token(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    return {"id": user["id"], "email": user["email"], "is_authenticated": True}


async def resolve_owner_email(
    user_context: dict[str, Any] = Depends(resolve_user_context),
) -> str:
    return str(user_context["email"])


async def require_authenticated_user(
    user_context: dict[str, Any] = Depends(resolve_user_context),
) -> dict[str, str]:
    if not user_context.get("is_authenticated"):
        raise HTTPException(status_code=401, detail="You must sign in to perform this action.")
    return {"id": str(user_context["id"]), "email": str(user_context["email"])}


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


@app.get(f"{settings.api_prefix}/profile/me", response_model=ProfileResponse)
async def get_my_profile(
    user: dict[str, str] = Depends(require_authenticated_user),
) -> ProfileResponse:
    profile = repository.get_or_create_profile(user["id"], user["email"])
    return ProfileResponse(**profile)


@app.put(f"{settings.api_prefix}/profile/me", response_model=ProfileResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    user: dict[str, str] = Depends(require_authenticated_user),
) -> ProfileResponse:
    updates = payload.model_dump(exclude_unset=True)
    if "handle" in updates:
        cleaned_handle = _clean_handle(str(updates["handle"]))
        if len(cleaned_handle) < 3:
            raise HTTPException(status_code=400, detail="Handle must be at least 3 valid characters.")
        updates["handle"] = cleaned_handle
    if "display_name" in updates:
        value = str(updates["display_name"]).strip()
        if not value:
            raise HTTPException(status_code=400, detail="Display name cannot be empty.")
        updates["display_name"] = value[:50]
    if "bio" in updates:
        updates["bio"] = str(updates["bio"]).strip()[:280]

    profile = repository.update_profile(user["id"], user["email"], updates)
    return ProfileResponse(**profile)


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


@app.post(f"{settings.api_prefix}/proofs/{{verification_id}}/share", response_model=ShareLinkResponse)
async def create_share_link(
    verification_id: str,
    user: dict[str, str] = Depends(require_authenticated_user),
) -> ShareLinkResponse:
    proof = repository.get_proof(verification_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Verification ID not found.")
    if proof.get("owner_email") != user["email"]:
        raise HTTPException(status_code=403, detail="You do not own this verification proof.")

    share_token = proof.get("share_token") or secrets.token_urlsafe(18)
    updated = repository.enable_share_link(verification_id, user["email"], share_token)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to create share link.")

    share_url = f"{settings.public_app_url.rstrip('/')}/?share={share_token}"
    await ws_manager.broadcast(
        "proof_shared",
        {
            "verification_id": verification_id,
            "owner_email": user["email"],
            "share_token": share_token,
            "share_url": share_url,
        },
    )

    return ShareLinkResponse(
        verification_id=verification_id,
        share_token=share_token,
        share_url=share_url,
        auto_delete_at=updated.get("auto_delete_at"),
    )


@app.get(f"{settings.api_prefix}/shared/{{share_token}}", response_model=SharedProofResponse)
async def get_shared_proof_details(share_token: str) -> SharedProofResponse:
    proof = repository.get_proof_by_share_token(share_token)
    if not proof:
        raise HTTPException(status_code=404, detail="Shared proof link is invalid or disabled.")

    return SharedProofResponse(
        verification_id=proof["verification_id"],
        filename=proof["filename"],
        pqc_algorithm=proof["pqc_algorithm"],
        owner_display=_mask_owner_email(proof["owner_email"]),
        created_at=proof["created_at"],
    )


@app.post(
    f"{settings.api_prefix}/shared/{{share_token}}/verify-upload",
    response_model=SharedVerifyResponse,
)
async def verify_shared_upload(
    share_token: str,
    file: UploadFile = File(...),
    user_context: dict[str, Any] = Depends(resolve_user_context),
) -> SharedVerifyResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")

    proof = repository.get_proof_by_share_token(share_token)
    if not proof:
        raise HTTPException(status_code=404, detail="Shared proof link is invalid or disabled.")

    signature_valid = pqc_engine.verify_hash_with_public_key(
        signature=pqc_engine.decode_signature_b64(proof["signature_b64"]),
        hash_value=proof["hash_sha3_512"],
        public_key_b64=proof["public_key_b64"],
    )
    submitted_hash = generate_hash(content)
    file_hash_match = submitted_hash == proof["hash_sha3_512"]

    status = "VERIFIED" if signature_valid and file_hash_match else "TAMPERED"
    detail = (
        "Shared upload matches original quantum proof."
        if status == "VERIFIED"
        else "Shared upload is tampered or does not match original hash."
    )

    checker_email = (
        str(user_context["email"])
        if user_context.get("is_authenticated")
        else "guest@aegis.share"
    )
    had_auto_delete = bool(proof.get("auto_delete_at"))
    updated_proof = repository.record_external_check(
        proof=proof,
        checker_email=checker_email,
        checker_filename=_clean_filename(file.filename or "unnamed"),
        checker_hash=submitted_hash,
        status=status,
        detail=detail,
        auto_delete_after_hours=settings.auto_delete_after_recheck_hours,
    )

    event_type = "SHARED_FILE_TAMPERED" if status == "TAMPERED" else "SHARED_FILE_RECHECKED"
    repository.insert_notification(
        owner_email=proof["owner_email"],
        verification_id=proof["verification_id"],
        event_type=event_type,
        checker_email=checker_email,
        is_tampered=(status == "TAMPERED"),
        message=(
            f"{checker_email} re-verified shared file "
            f"{proof['filename']} ({status})."
        ),
    )

    if not had_auto_delete and updated_proof.get("auto_delete_at"):
        repository.insert_notification(
            owner_email=proof["owner_email"],
            verification_id=proof["verification_id"],
            event_type="AUTO_DELETE_SCHEDULED",
            checker_email=checker_email,
            is_tampered=False,
            message=(
                "Auto-delete scheduled after external recheck. "
                f"Delete before {updated_proof.get('auto_delete_at')} to control lifecycle."
            ),
        )

    await ws_manager.broadcast(
        "shared_file_rechecked",
        {
            "verification_id": proof["verification_id"],
            "checker_email": checker_email,
            "status": status,
            "is_tampered": status == "TAMPERED",
            "auto_delete_at": updated_proof.get("auto_delete_at"),
        },
    )

    return SharedVerifyResponse(
        verification_id=proof["verification_id"],
        status=status,
        signature_valid=signature_valid,
        file_hash_match=file_hash_match,
        detail=detail,
        expected_hash_sha3_512=proof["hash_sha3_512"],
        submitted_hash_sha3_512=submitted_hash,
        auto_delete_at=updated_proof.get("auto_delete_at"),
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
    repository.cleanup_expired_proofs(limit=25)
    rows = repository.list_proofs(owner_email if repository.enabled else None, limit=limit)
    return {"items": rows, "count": len(rows)}


@app.delete(
    f"{settings.api_prefix}/proofs/{{verification_id}}",
    response_model=DeleteProofResponse,
)
async def delete_proof(
    verification_id: str,
    user: dict[str, str] = Depends(require_authenticated_user),
) -> DeleteProofResponse:
    proof = repository.get_proof(verification_id)
    if not proof:
        raise HTTPException(status_code=404, detail="Verification ID not found.")
    if proof.get("owner_email") != user["email"]:
        raise HTTPException(status_code=403, detail="You do not own this verification proof.")

    deleted = repository.delete_proof(verification_id, user["email"])
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete proof.")

    await ws_manager.broadcast(
        "proof_deleted",
        {
            "verification_id": verification_id,
            "owner_email": user["email"],
        },
    )

    return DeleteProofResponse(
        deleted=True,
        verification_id=verification_id,
        detail="Proof and encrypted vault file deleted.",
    )


@app.get(f"{settings.api_prefix}/notifications", response_model=NotificationsResponse)
async def list_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    user: dict[str, str] = Depends(require_authenticated_user),
) -> NotificationsResponse:
    repository.cleanup_expired_proofs(limit=25)
    rows = repository.list_notifications(user["email"], limit=limit)
    items = [NotificationItem(**row) for row in rows]
    return NotificationsResponse(items=items, count=len(items))


@app.post(f"{settings.api_prefix}/notifications/{{notification_id}}/read")
async def mark_notification_as_read(
    notification_id: int,
    user: dict[str, str] = Depends(require_authenticated_user),
) -> dict:
    updated = repository.mark_notification_read(notification_id, user["email"])
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"updated": True}


@app.websocket("/ws/proofs")
async def proofs_socket(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and allow clients to send ping payloads.
            await websocket.receive_text()
    except Exception:
        await ws_manager.disconnect(websocket)
