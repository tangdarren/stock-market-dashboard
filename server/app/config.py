"""Application configuration loaded from environment via pydantic-settings.

The API key is never logged. Only its *presence* is announced at startup.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

SERVER_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = SERVER_ROOT / "artifacts"
DATA_RAW_DIR = SERVER_ROOT / "data" / "raw"


class Settings(BaseSettings):
    """Runtime configuration.

    Values are read from `server/.env` at startup. See `server/.env.example`.
    """

    app_env: str = Field(default="development")
    alpha_vantage_api_key: str = Field(default="")
    alpha_vantage_daily_budget: int = Field(default=20, ge=1, le=500)
    alpha_vantage_min_interval_seconds: int = Field(default=15, ge=0, le=600)
    frontend_origin: str = Field(default="http://localhost:5173")

    model_config = SettingsConfigDict(
        env_file=SERVER_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def has_api_key(self) -> bool:
        return bool(self.alpha_vantage_api_key) and self.alpha_vantage_api_key != "replace_with_your_key"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def announce_startup_configuration(settings: Settings) -> None:
    """Log a sanitized view of the configuration. Never emit the key itself."""
    logger.info("SPY Forecast Lab backend starting (env=%s)", settings.app_env)
    logger.info("Alpha Vantage key present: %s", "yes" if settings.has_api_key else "no")
    logger.info(
        "Alpha Vantage daily budget: %d call(s); min interval: %ds",
        settings.alpha_vantage_daily_budget,
        settings.alpha_vantage_min_interval_seconds,
    )
    logger.info("Frontend origin (CORS): %s", settings.frontend_origin)
    if not settings.has_api_key:
        logger.warning(
            "ALPHA_VANTAGE_API_KEY is not configured. Live market endpoints will return "
            "an unavailable status. Set it in server/.env to enable Alpha Vantage."
        )
