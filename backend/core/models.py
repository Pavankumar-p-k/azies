from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    environment: str
    pqc_algorithm: str
    pqc_backend: str
    pqc_fallback_active: bool
    supabase_enabled: bool


class ProofResponse(BaseModel):
    verification_id: str
    filename: str
    size_bytes: int
    hash_sha3_512: str
    signature_b64: str
    public_key_b64: str
    pqc_algorithm: str
    status: Literal["VERIFIED", "TAMPERED"]
    owner_email: str
    created_at: str


class VerifyResponse(BaseModel):
    verification_id: str
    status: Literal["VERIFIED", "TAMPERED"]
    signature_valid: bool
    file_hash_match: Optional[bool] = None
    detail: str = Field(default="")
