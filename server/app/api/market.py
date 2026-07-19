"""Market data endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.analogue_service import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    MIN_LIMIT,
    AnalogueService,
    get_analogue_service,
)
from app.services.market_service import (
    MarketDataUnavailable,
    MarketService,
    get_market_service,
)

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/spy")
async def get_spy_market(
    market_service: MarketService = Depends(get_market_service),
    refresh: bool = Query(default=False),
) -> dict[str, Any]:
    """Latest completed SPY daily snapshot plus recent series and cache metadata."""
    if refresh:
        from app.services.market_service import SPY_TIMESERIES_CACHE_KEY, _default_cache

        _default_cache().delete(SPY_TIMESERIES_CACHE_KEY)
    try:
        return await market_service.get_spy_daily()
    except MarketDataUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": str(exc),
                "reason": exc.reason,
                "mode": "unavailable",
            },
        ) from exc


@router.get("/spy/analogues")
async def get_spy_analogues(
    analogue_service: AnalogueService = Depends(get_analogue_service),
    limit: int = Query(default=DEFAULT_LIMIT, ge=MIN_LIMIT, le=MAX_LIMIT),
) -> dict[str, Any]:
    """Historical SPY sessions most similar to the latest completed session.

    Descriptive analysis only — not a forecast. See the ``disclaimer`` field
    in the response. Soft failures (missing local dataset, insufficient
    observations, market data unavailable, feature-schema mismatch) return a
    structured ``available: false`` payload rather than a 5xx so this panel
    can degrade gracefully alongside the rest of the dashboard.
    """
    return await analogue_service.get_spy_analogues(limit=limit)
