"""
Post-quantum signature engine for Project Aegis.

Primary backend:
- `liboqs` ML-DSA (Dilithium) when available.

Fallback backend:
- Ed25519, used only when OQS is not present in local dev environments.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

try:
    import oqs  # type: ignore
except Exception:  # pragma: no cover
    oqs = None


@dataclass(frozen=True)
class EngineInfo:
    algorithm: str
    backend: str
    fallback_active: bool


class PQCEngine:
    def __init__(self, algorithm: str = "ML-DSA-65"):
        self.algorithm = algorithm
        self._fallback_active = False
        self._backend = "liboqs"

        self._private_key_oqs: bytes | None = None
        self._public_key_oqs: bytes | None = None

        self._private_key_fallback: ed25519.Ed25519PrivateKey | None = None
        self._public_key_fallback: ed25519.Ed25519PublicKey | None = None

        self._setup()

    def _setup(self) -> None:
        if oqs is not None:
            enabled = set(oqs.get_enabled_sig_mechanisms())
            if self.algorithm in enabled:
                with oqs.Signature(self.algorithm) as signer:
                    self._public_key_oqs = signer.generate_keypair()
                    self._private_key_oqs = signer.export_secret_key()
                    self._fallback_active = False
                    self._backend = "liboqs"
                    return

        self._private_key_fallback = ed25519.Ed25519PrivateKey.generate()
        self._public_key_fallback = self._private_key_fallback.public_key()
        self._fallback_active = True
        self._backend = "ed25519-fallback"

    @property
    def info(self) -> EngineInfo:
        return EngineInfo(
            algorithm=self.algorithm,
            backend=self._backend,
            fallback_active=self._fallback_active,
        )

    def sign_hash(self, hash_value: str) -> bytes:
        payload = hash_value.encode("utf-8")
        if self._fallback_active and self._private_key_fallback is not None:
            return self._private_key_fallback.sign(payload)
        if self._private_key_oqs is None:
            raise RuntimeError("PQC private key is not initialized.")
        with oqs.Signature(self.algorithm, secret_key=self._private_key_oqs) as signer:
            return signer.sign(payload)

    def verify_hash(self, signature: bytes, hash_value: str) -> bool:
        if self._fallback_active:
            if self._public_key_fallback is None:
                return False
            return self.verify_hash_with_public_key(
                signature=signature,
                hash_value=hash_value,
                public_key_b64=base64.b64encode(
                    self._public_key_fallback.public_bytes(
                        encoding=Encoding.Raw, format=PublicFormat.Raw
                    )
                ).decode("utf-8"),
            )
        if self._public_key_oqs is None:
            return False
        return self.verify_hash_with_public_key(
            signature=signature,
            hash_value=hash_value,
            public_key_b64=base64.b64encode(self._public_key_oqs).decode("utf-8"),
        )

    def verify_hash_with_public_key(
        self, signature: bytes, hash_value: str, public_key_b64: str
    ) -> bool:
        payload = hash_value.encode("utf-8")
        public_key = base64.b64decode(public_key_b64.encode("utf-8"))

        if self._fallback_active:
            try:
                public_key_object = ed25519.Ed25519PublicKey.from_public_bytes(public_key)
                public_key_object.verify(signature, payload)
                return True
            except Exception:
                return False

        if oqs is None:
            return False

        with oqs.Signature(self.algorithm) as verifier:
            try:
                return verifier.verify(payload, signature, public_key)
            except Exception:
                return False

    def export_public_key_b64(self) -> str:
        if self._fallback_active and self._public_key_fallback is not None:
            raw = self._public_key_fallback.public_bytes(
                encoding=Encoding.Raw, format=PublicFormat.Raw
            )
            return base64.b64encode(raw).decode("utf-8")
        if self._public_key_oqs is None:
            raise RuntimeError("Public key not initialized.")
        return base64.b64encode(self._public_key_oqs).decode("utf-8")

    @staticmethod
    def encode_signature_b64(signature: bytes) -> str:
        return base64.b64encode(signature).decode("utf-8")

    @staticmethod
    def decode_signature_b64(signature_b64: str) -> bytes:
        return base64.b64decode(signature_b64.encode("utf-8"))
