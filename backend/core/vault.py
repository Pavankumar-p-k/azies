from __future__ import annotations

import base64
import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass(frozen=True)
class EncryptedPayload:
    payload: bytes
    key_fingerprint: str
    nonce_b64: str
    encrypted_at: str


class VaultCipher:
    def __init__(self, raw_key: str):
        self._key = self._materialize_key(raw_key)
        self._aesgcm = AESGCM(self._key)
        self._key_fingerprint = hashlib.sha256(self._key).hexdigest()[:16]

    @staticmethod
    def _materialize_key(raw_key: str) -> bytes:
        # Preferred format: base64 encoded 32-byte key.
        if raw_key:
            try:
                decoded = base64.b64decode(raw_key, validate=True)
                if len(decoded) == 32:
                    return decoded
            except Exception:
                pass
            if len(raw_key) == 64:
                try:
                    decoded = bytes.fromhex(raw_key)
                    if len(decoded) == 32:
                        return decoded
                except Exception:
                    pass

        # Local fallback key for developer convenience.
        return hashlib.sha256(
            b"project-aegis-dev-key-change-in-production"
        ).digest()

    def encrypt(self, plaintext: bytes) -> EncryptedPayload:
        nonce = os.urandom(12)
        ciphertext = self._aesgcm.encrypt(nonce, plaintext, None)
        blob = nonce + ciphertext
        return EncryptedPayload(
            payload=blob,
            key_fingerprint=self._key_fingerprint,
            nonce_b64=base64.b64encode(nonce).decode("utf-8"),
            encrypted_at=datetime.now(timezone.utc).isoformat(),
        )

    def decrypt(self, payload: bytes) -> bytes:
        nonce = payload[:12]
        ciphertext = payload[12:]
        return self._aesgcm.decrypt(nonce, ciphertext, None)
