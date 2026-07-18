"""Liveness endpoint. Never returns secrets."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.services.forecast_service import ForecastService, get_forecast_service
from app.services.market_service import MarketService, get_market_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(
    settings: Settings = Depends(get_settings),
    market_service: MarketService = Depends(get_market_service),
    forecast_service: ForecastService = Depends(get_forecast_service),
) -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "spy-forecast-lab-backend",
        "version": "0.1.0",
        "time": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "env": settings.app_env,
        "alpha_vantage_configured": settings.has_api_key,
        "market_cache_available": market_service.has_cached_snapshot(),
        "model_available": forecast_service.is_available(),
    }
