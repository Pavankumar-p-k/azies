from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Project Aegis API"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173"
    )

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket: str = "aegis-vault"
    supabase_table: str = "integrity_proofs"

    vault_master_key: str = ""
    pqc_algorithm: str = "ML-DSA-65"

    p2p_peers: str = ""
    public_app_url: str = "http://localhost:5173"
    auto_delete_after_recheck_hours: int = 24

    @field_validator("app_env")
    @classmethod
    def validate_env(cls, value: str) -> str:
        allowed = {"development", "staging", "production"}
        lowered = value.lower().strip()
        if lowered not in allowed:
            return "development"
        return lowered

    @property
    def cors_origins_list(self) -> List[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def p2p_peers_list(self) -> List[str]:
        return [item.strip() for item in self.p2p_peers.split(",") if item.strip()]

    @property
    def supabase_key(self) -> str:
        if self.supabase_service_role_key:
            return self.supabase_service_role_key
        return self.supabase_anon_key

    @property
    def is_supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
