"""Metrics endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.services.forecast_service import get_metrics_payload, get_model_version

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
