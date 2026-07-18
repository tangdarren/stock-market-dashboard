"""Forecast endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.services.forecast_service import (
    ForecastService,
    get_forecast_service,
    get_model_version,
    get_walk_forward_records,
)

router = APIRouter(prefix="/forecasts", tags=["forecasts"])


@router.get("/spy")
async def get_spy_forecast(
    forecast_service: ForecastService = Depends(get_forecast_service),
) -> dict[str, Any]:
    payload = await forecast_service.forecast()
    payload["model_version"] = get_model_version()
    return payload


@router.get("/history")
async def get_forecast_history(
    limit: int = Query(default=30, ge=1, le=500),
) -> dict[str, Any]:
    records = get_walk_forward_records(limit=limit)
    return {
        "records": records,
        "count": len(records),
        "model_version": get_model_version(),
    }
