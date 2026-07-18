"""Shared pytest fixtures.

- Redirect artifacts and cache DB to per-test temporary directories.
- Provide clean env for pydantic settings.
- Prevent Alpha Vantage tests from ever hitting the live network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parent.parent
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


@pytest.fixture(autouse=True)
def _isolate_settings(tmp_path, monkeypatch):
    """Run every test with an isolated env file, artifacts dir and cache DB."""
    monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)
    monkeypatch.delenv("ALPHA_VANTAGE_DAILY_BUDGET", raising=False)
    monkeypatch.delenv("ALPHA_VANTAGE_MIN_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)

    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir()
    data_raw = tmp_path / "data"
    data_raw.mkdir()

    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    config_module.get_settings.cache_clear()

    from app.services import market_service

    market_service._default_database.cache_clear()
    market_service._default_cache.cache_clear()
    market_service._default_rate_limiter.cache_clear()

    yield

    market_service._default_database.cache_clear()
    market_service._default_cache.cache_clear()
    market_service._default_rate_limiter.cache_clear()
    config_module.get_settings.cache_clear()


@pytest.fixture
def anyio_backend():
    return "asyncio"
