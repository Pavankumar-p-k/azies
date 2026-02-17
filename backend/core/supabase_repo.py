from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from supabase import Client, create_client

from .settings import Settings

logger = logging.getLogger(__name__)


class SupabaseRepository:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Optional[Client] = None
        self._configure_client()
        backend_root = Path(__file__).resolve().parent.parent
        self._node_a_path = backend_root / "storage" / "node_A" / "ledger.json"
        self._node_b_path = backend_root / "storage" / "node_B" / "ledger.json"

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _configure_client(self) -> None:
        if not self.settings.is_supabase_configured:
            logger.warning("Supabase is not configured. Running in local ledger mode.")
            return
        self.client = create_client(self.settings.supabase_url, self.settings.supabase_key)

    def get_user_email_from_token(self, access_token: str) -> Optional[str]:
        if not self.client:
            return None
        try:
            response = self.client.auth.get_user(access_token)
            if response and response.user:
                return response.user.email
        except Exception:
            return None
        return None

    def insert_proof(self, proof: Dict[str, Any]) -> None:
        if self.client:
            self.client.table(self.settings.supabase_table).insert(proof).execute()
            return
        self._append_local_ledgers(proof)

    def get_proof(self, verification_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            response = (
                self.client.table(self.settings.supabase_table)
                .select("*")
                .eq("verification_id", verification_id)
                .limit(1)
                .execute()
            )
            data = response.data or []
            return data[0] if data else None

        proofs = self._read_local_proofs()
        for proof in proofs:
            if proof.get("verification_id") == verification_id:
                return proof
        return None

    def list_proofs(self, owner_email: Optional[str], limit: int = 100) -> List[Dict[str, Any]]:
        if self.client:
            query = (
                self.client.table(self.settings.supabase_table)
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
            )
            if owner_email:
                query = query.eq("owner_email", owner_email)
            response = query.execute()
            return response.data or []
        proofs = self._read_local_proofs()
        if owner_email:
            proofs = [item for item in proofs if item.get("owner_email") == owner_email]
        proofs.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return proofs[:limit]

    def upload_vault_blob(self, path: str, payload: bytes) -> Optional[str]:
        if self.client:
            self.client.storage.from_(self.settings.supabase_bucket).upload(
                path=path,
                file=payload,
                file_options={"content-type": "application/octet-stream", "upsert": "true"},
            )
            return path
        return path

    def download_vault_blob(self, path: str) -> Optional[bytes]:
        if not self.client:
            return None
        blob = self.client.storage.from_(self.settings.supabase_bucket).download(path)
        if isinstance(blob, bytes):
            return blob
        return None

    def _append_local_ledgers(self, proof: Dict[str, Any]) -> None:
        for target in (self._node_a_path, self._node_b_path):
            target.parent.mkdir(parents=True, exist_ok=True)
            ledger = []
            if target.exists():
                ledger = json.loads(target.read_text(encoding="utf-8"))
            ledger.append(proof)
            target.write_text(json.dumps(ledger, indent=2), encoding="utf-8")

    def _read_local_proofs(self) -> List[Dict[str, Any]]:
        if not self._node_a_path.exists():
            return []
        try:
            return json.loads(self._node_a_path.read_text(encoding="utf-8"))
        except Exception:
            return []

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
