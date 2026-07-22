"""Metrics and Model Health monitoring endpoints."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.ml.schemas import ModelMonitoringResponse
from app.services.forecast_service import get_metrics_payload, get_model_version
from app.services.monitoring_service import (
    ALLOWED_WINDOWS,
    MonitoringService,
    get_monitoring_service,
)

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/metrics")
async def get_metrics() -> dict[str, Any]:
    payload = get_metrics_payload()
    if payload is None:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Model metrics unavailable. Train the models via "
                "`python server/scripts/train_models.py`.",
                "reason": "artifacts_missing",
            },
        )
    payload["model_version"] = get_model_version()
    return payload


@router.get("/monitoring", response_model=ModelMonitoringResponse)
async def get_model_monitoring(
    horizon: Literal["1d", "5d"] = Query(
        default="1d",
        description="Forecast horizon key: 1d or 5d.",
    ),
    window: int = Query(
        default=30,
        description="Rolling observation window: 30, 60, 120, or 252.",
    ),
    monitoring_service: MonitoringService = Depends(get_monitoring_service),
) -> ModelMonitoringResponse:
    """Combined rolling performance and feature-drift health for one selection.

    Soft failures (missing/malformed artifacts, insufficient history) return
    ``available: false`` with a machine-readable ``reason`` rather than a 5xx.
    Invalid ``window`` values return HTTP 422.
    """
    if window not in ALLOWED_WINDOWS:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"window must be one of {list(ALLOWED_WINDOWS)}.",
                "reason": "invalid_window",
            },
        )
    payload = monitoring_service.get_monitoring(horizon=horizon, window=window)
    return ModelMonitoringResponse.model_validate(payload)
