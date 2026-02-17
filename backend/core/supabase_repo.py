from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
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
        self._local_profiles: Dict[str, Dict[str, Any]] = {}
        self._local_notifications: List[Dict[str, Any]] = []
        self._local_verification_checks: List[Dict[str, Any]] = []
        self._memory_share_links: Dict[str, str] = {}
        self._schema_warning_cache: set[str] = set()

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _configure_client(self) -> None:
        if not self.settings.is_supabase_configured:
            logger.warning("Supabase is not configured. Running in local ledger mode.")
            return
        self.client = create_client(self.settings.supabase_url, self.settings.supabase_key)

    def get_user_from_token(self, access_token: str) -> Optional[Dict[str, str]]:
        if not self.client:
            return None
        try:
            response = self.client.auth.get_user(access_token)
            if response and response.user and response.user.email:
                return {"id": response.user.id, "email": response.user.email}
        except Exception:
            return None
        return None

    def get_user_email_from_token(self, access_token: str) -> Optional[str]:
        user = self.get_user_from_token(access_token)
        if not user:
            return None
        return user["email"]

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

    def get_or_create_profile(self, user_id: str, email: str) -> Dict[str, Any]:
        if self.client:
            try:
                response = (
                    self.client.table("user_profiles")
                    .select("*")
                    .eq("id", user_id)
                    .limit(1)
                    .execute()
                )
                data = response.data or []
                if data:
                    return data[0]

                default_profile = self._default_profile(user_id, email)
                inserted = self.client.table("user_profiles").insert(default_profile).execute()
                inserted_data = inserted.data or []
                return inserted_data[0] if inserted_data else default_profile
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "user_profiles",
                    "Supabase table user_profiles is missing. Using in-memory profile fallback.",
                    exc,
                )

        profile = self._local_profiles.get(email)
        if profile:
            return profile
        profile = self._default_profile(user_id, email)
        self._local_profiles[email] = profile
        return profile

    def update_profile(self, user_id: str, email: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        profile = self.get_or_create_profile(user_id, email)
        safe_updates = {key: value for key, value in updates.items() if value is not None}
        if not safe_updates:
            return profile

        if self.client:
            try:
                response = (
                    self.client.table("user_profiles")
                    .update(safe_updates)
                    .eq("id", user_id)
                    .eq("email", email)
                    .execute()
                )
                data = response.data or []
                if data:
                    return data[0]
                refreshed = self.get_or_create_profile(user_id, email)
                return refreshed
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "user_profiles_update",
                    "Supabase table user_profiles is missing. Saving profile in memory only.",
                    exc,
                )

        profile.update(safe_updates)
        profile["updated_at"] = self.now_iso()
        self._local_profiles[email] = profile
        return profile

    def get_proof_by_share_token(self, share_token: str) -> Optional[Dict[str, Any]]:
        if self.client:
            try:
                response = (
                    self.client.table(self.settings.supabase_table)
                    .select("*")
                    .eq("share_token", share_token)
                    .eq("share_enabled", True)
                    .limit(1)
                    .execute()
                )
                data = response.data or []
                return data[0] if data else None
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "share_columns_lookup",
                    "Share-link columns are missing on integrity_proofs. Falling back to in-memory share links until migration is applied.",
                    exc,
                )
                verification_id = self._memory_share_links.get(share_token)
                if verification_id:
                    proof = self.get_proof(verification_id)
                    if proof:
                        return {
                            **proof,
                            "share_token": share_token,
                            "share_enabled": True,
                        }

        proofs = self._read_local_proofs()
        for proof in proofs:
            if proof.get("share_token") == share_token and proof.get("share_enabled"):
                return proof
        return None

    def enable_share_link(self, verification_id: str, owner_email: str, share_token: str) -> Optional[Dict[str, Any]]:
        payload = {
            "share_token": share_token,
            "share_enabled": True,
            "shared_at": self.now_iso(),
        }
        if self.client:
            try:
                response = (
                    self.client.table(self.settings.supabase_table)
                    .update(payload)
                    .eq("verification_id", verification_id)
                    .eq("owner_email", owner_email)
                    .execute()
                )
                data = response.data or []
                return data[0] if data else None
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "share_columns_update",
                    "Share-link columns are missing on integrity_proofs. Creating in-memory share links until migration is applied.",
                    exc,
                )
                self._memory_share_links[share_token] = verification_id
                proof = self.get_proof(verification_id)
                if proof:
                    return {
                        **proof,
                        **payload,
                    }
                return {
                    "verification_id": verification_id,
                    "owner_email": owner_email,
                    **payload,
                }

        proofs = self._read_local_proofs()
        target = None
        for proof in proofs:
            if (
                proof.get("verification_id") == verification_id
                and proof.get("owner_email") == owner_email
            ):
                proof.update(payload)
                target = proof
                break
        if target is None:
            return None
        self._overwrite_local_ledgers(proofs)
        return target

    def record_external_check(
        self,
        proof: Dict[str, Any],
        checker_email: str,
        checker_filename: str,
        checker_hash: str,
        status: str,
        detail: str,
        auto_delete_after_hours: int,
    ) -> Dict[str, Any]:
        verification_id = proof["verification_id"]
        share_token = proof.get("share_token") or ""
        check_row = {
            "verification_id": verification_id,
            "share_token": share_token,
            "checker_email": checker_email,
            "checker_filename": checker_filename,
            "checker_hash_sha3_512": checker_hash,
            "expected_hash_sha3_512": proof["hash_sha3_512"],
            "status": status,
            "detail": detail,
            "created_at": self.now_iso(),
        }

        if self.client:
            try:
                self.client.table("verification_checks").insert(check_row).execute()
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "verification_checks",
                    "Table verification_checks is missing. External checks will not be persisted in Supabase.",
                    exc,
                )
                self._local_verification_checks.append(check_row)
        else:
            self._local_verification_checks.append(check_row)

        next_count = int(proof.get("external_check_count") or 0) + 1
        now = datetime.now(timezone.utc)
        auto_delete_at = proof.get("auto_delete_at")
        if not auto_delete_at:
            auto_delete_at = (now + timedelta(hours=auto_delete_after_hours)).isoformat()
        patch = {
            "external_check_count": next_count,
            "last_external_check_at": now.isoformat(),
            "auto_delete_at": auto_delete_at,
        }

        if self.client:
            try:
                updated = (
                    self.client.table(self.settings.supabase_table)
                    .update(patch)
                    .eq("verification_id", verification_id)
                    .execute()
                )
                data = updated.data or []
                if data:
                    proof = data[0]
                else:
                    proof = {**proof, **patch}
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "integrity_proofs_share_fields",
                    "New share/cleanup columns are missing on integrity_proofs. Runtime will continue without persisted external-check counters.",
                    exc,
                )
                proof = {**proof, **patch}
        else:
            proofs = self._read_local_proofs()
            for item in proofs:
                if item.get("verification_id") == verification_id:
                    item.update(patch)
                    proof = item
                    break
            self._overwrite_local_ledgers(proofs)

        return proof

    def insert_notification(
        self,
        owner_email: str,
        verification_id: str,
        event_type: str,
        checker_email: str,
        is_tampered: bool,
        message: str,
    ) -> Dict[str, Any]:
        payload = {
            "owner_email": owner_email,
            "verification_id": verification_id,
            "event_type": event_type,
            "checker_email": checker_email,
            "is_tampered": is_tampered,
            "message": message,
            "created_at": self.now_iso(),
        }
        if self.client:
            try:
                response = self.client.table("user_notifications").insert(payload).execute()
                data = response.data or []
                return data[0] if data else payload
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "user_notifications_insert",
                    "Table user_notifications is missing. Notification write will fallback to local memory.",
                    exc,
                )
        payload["id"] = len(self._local_notifications) + 1
        self._local_notifications.append(payload)
        return payload

    def list_notifications(self, owner_email: str, limit: int = 50) -> List[Dict[str, Any]]:
        if self.client:
            try:
                response = (
                    self.client.table("user_notifications")
                    .select("*")
                    .eq("owner_email", owner_email)
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
                return response.data or []
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "user_notifications_list",
                    "Table user_notifications is missing. Notification reads will fallback to local memory.",
                    exc,
                )
        filtered = [
            item for item in self._local_notifications if item.get("owner_email") == owner_email
        ]
        filtered.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return filtered[:limit]

    def mark_notification_read(self, notification_id: int, owner_email: str) -> bool:
        if self.client:
            try:
                response = (
                    self.client.table("user_notifications")
                    .update({"read_at": self.now_iso()})
                    .eq("id", notification_id)
                    .eq("owner_email", owner_email)
                    .execute()
                )
                return bool(response.data)
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "user_notifications_mark_read",
                    "Table user_notifications is missing. Notification updates will fallback to local memory.",
                    exc,
                )

        for item in self._local_notifications:
            if item.get("id") == notification_id and item.get("owner_email") == owner_email:
                item["read_at"] = self.now_iso()
                return True
        return False

    def delete_proof(self, verification_id: str, owner_email: str) -> Optional[Dict[str, Any]]:
        proof = self.get_proof(verification_id)
        if not proof:
            return None
        if proof.get("owner_email") != owner_email:
            return None

        self.delete_vault_blob(proof.get("storage_path"))

        if self.client:
            self.client.table(self.settings.supabase_table).delete().eq(
                "verification_id", verification_id
            ).eq("owner_email", owner_email).execute()
            self._remove_memory_share_links_for_verification(verification_id)
            return proof

        proofs = self._read_local_proofs()
        proofs = [item for item in proofs if item.get("verification_id") != verification_id]
        self._overwrite_local_ledgers(proofs)
        self._remove_memory_share_links_for_verification(verification_id)
        return proof

    def delete_vault_blob(self, path: Optional[str]) -> None:
        if not path:
            return
        if not self.client:
            return
        try:
            self.client.storage.from_(self.settings.supabase_bucket).remove([path])
        except Exception:
            logger.warning("Failed to remove storage path %s", path)

    def cleanup_expired_proofs(self, limit: int = 100) -> int:
        if self.client:
            try:
                now_iso = self.now_iso()
                response = (
                    self.client.table(self.settings.supabase_table)
                    .select("verification_id,storage_path")
                    .lte("auto_delete_at", now_iso)
                    .limit(limit)
                    .execute()
                )
                rows = response.data or []
                for row in rows:
                    self.delete_vault_blob(row.get("storage_path"))
                    self.client.table(self.settings.supabase_table).delete().eq(
                        "verification_id", row["verification_id"]
                    ).execute()
                return len(rows)
            except Exception as exc:
                if not self._is_schema_compat_error(exc):
                    raise
                self._warn_schema_fallback(
                    "integrity_proofs_auto_delete",
                    "Column integrity_proofs.auto_delete_at is missing. Expired-proof cleanup is skipped until migration is applied.",
                    exc,
                )
                return 0

        proofs = self._read_local_proofs()
        now = datetime.now(timezone.utc)
        kept: List[Dict[str, Any]] = []
        removed = 0
        for proof in proofs:
            auto_delete_at = proof.get("auto_delete_at")
            if not auto_delete_at:
                kept.append(proof)
                continue
            try:
                expires = datetime.fromisoformat(auto_delete_at)
                if expires <= now:
                    removed += 1
                    continue
            except Exception:
                pass
            kept.append(proof)
        if removed > 0:
            self._overwrite_local_ledgers(kept)
        return removed

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

    def _overwrite_local_ledgers(self, proofs: List[Dict[str, Any]]) -> None:
        for target in (self._node_a_path, self._node_b_path):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(proofs, indent=2), encoding="utf-8")

    def _read_local_proofs(self) -> List[Dict[str, Any]]:
        if not self._node_a_path.exists():
            return []
        try:
            return json.loads(self._node_a_path.read_text(encoding="utf-8"))
        except Exception:
            return []

    @staticmethod
    def _default_handle(email: str) -> str:
        prefix = email.split("@")[0].lower()
        cleaned = re.sub(r"[^a-z0-9_.-]+", "", prefix).strip("._-")
        return cleaned or "aegis_user"

    def _default_profile(self, user_id: str, email: str) -> Dict[str, Any]:
        base = self._default_handle(email)
        handle = f"{base}_{user_id[:6]}".strip("_")
        now = self.now_iso()
        return {
            "id": user_id,
            "email": email,
            "handle": handle,
            "display_name": handle,
            "bio": "Quantum-secure file creator",
            "avatar_url": None,
            "created_at": now,
            "updated_at": now,
        }

    def _warn_schema_fallback(self, key: str, message: str, exc: Exception) -> None:
        if key in self._schema_warning_cache:
            return
        self._schema_warning_cache.add(key)
        logger.warning("%s Error=%s", message, exc)

    def _remove_memory_share_links_for_verification(self, verification_id: str) -> None:
        stale_tokens = [
            token for token, value in self._memory_share_links.items() if value == verification_id
        ]
        for token in stale_tokens:
            self._memory_share_links.pop(token, None)

    @staticmethod
    def _is_schema_compat_error(exc: Exception) -> bool:
        code = ""
        raw = exc.args[0] if getattr(exc, "args", ()) else None
        if isinstance(raw, dict):
            code = str(raw.get("code") or "").upper()
        if code in {"42703", "42P01", "PGRST205"}:
            return True

        lowered = str(exc).lower()
        return (
            "does not exist" in lowered
            or "schema cache" in lowered
            or "could not find the table" in lowered
        )

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()
