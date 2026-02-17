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


class ProfileResponse(BaseModel):
    email: str
    handle: str
    display_name: str
    bio: str
    avatar_url: Optional[str] = None
    created_at: str
    updated_at: str


class ProfileUpdateRequest(BaseModel):
    handle: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class ShareLinkResponse(BaseModel):
    verification_id: str
    share_token: str
    share_url: str
    auto_delete_at: Optional[str] = None


class SharedProofResponse(BaseModel):
    verification_id: str
    filename: str
    pqc_algorithm: str
    owner_display: str
    created_at: str


class SharedVerifyResponse(BaseModel):
    verification_id: str
    status: Literal["VERIFIED", "TAMPERED"]
    signature_valid: bool
    file_hash_match: bool
    detail: str
    expected_hash_sha3_512: str
    submitted_hash_sha3_512: str
    auto_delete_at: Optional[str] = None


class NotificationItem(BaseModel):
    id: int
    verification_id: str
    event_type: str
    checker_email: str
    is_tampered: bool
    message: str
    created_at: str
    read_at: Optional[str] = None


class NotificationsResponse(BaseModel):
    items: list[NotificationItem]
    count: int


class DeleteProofResponse(BaseModel):
    deleted: bool
    verification_id: str
    detail: str
