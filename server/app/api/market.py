"""Market data endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

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
