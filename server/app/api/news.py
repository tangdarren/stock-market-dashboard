"""News sentiment endpoint (contextual only — not fed to the model)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import simulated_query
from app.clients.alpha_vantage import (
    AlphaVantageClient,
    AlphaVantageError,
)
from app.config import Settings, get_settings
from app.ml.simulated import (
    SIMULATED_DATA_DISCLAIMER,
    SimulatedDataError,
    get_simulated_workbook,
)
from app.services.market_service import (
    _default_cache,
    _default_rate_limiter,
)
from app.services.rate_limiter import RateLimitError

router = APIRouter(prefix="/news", tags=["news"])
logger = logging.getLogger(__name__)

CACHE_KEY = "alpha_vantage:news_sentiment:SPY"
SIMULATED_CACHE_KEY = "simulated:news_sentiment:SPY"
TTL_SECONDS = 4 * 60 * 60
SIMULATED_TTL_SECONDS = 24 * 60 * 60


@router.get("/spy")
async def get_news(
    settings: Settings = Depends(get_settings),
    simulated: bool = Depends(simulated_query),
) -> dict[str, Any]:
    if simulated:
        return _simulated_news()

    if not settings.has_api_key:
        return _unavailable("Alpha Vantage API key is not configured.")

    cache = _default_cache()
    rate_limiter = _default_rate_limiter()

    async def _fetch() -> dict[str, Any]:
        try:
            rate_limiter.ensure_can_call()
        except RateLimitError as exc:
            raise AlphaVantageError(f"Backend rate limit reached ({exc}).") from exc

        async with AlphaVantageClient(settings.alpha_vantage_api_key) as client:
            payload = await client.news_sentiment("SPY", limit=10)

        rate_limiter.record_call()
        return payload

    try:
        payload, meta = await cache.get_or_fetch(
            CACHE_KEY,
            ttl_seconds=TTL_SECONDS,
            fetch=_fetch,
        )
    except AlphaVantageError as exc:
        return _unavailable(str(exc))

    articles = [
        {
            "title": a.get("title"),
            "url": a.get("url"),
            "source": a.get("source"),
            "time_published": a.get("time_published"),
            "overall_sentiment_label": a.get("overall_sentiment_label"),
            "overall_sentiment_score": a.get("overall_sentiment_score"),
            "ticker_relevance": _pick_relevance(a.get("ticker_sentiment", []), "SPY"),
        }
        for a in (payload.get("feed") or [])[:10]
    ]

    return {
        "available": True,
        "articles": articles,
        "aggregate": {
            "n_articles": len(articles),
            "avg_score": _avg_score(articles),
        },
        "meta": meta,
        "mode": "live" if meta.get("cacheStatus") != "hit" else "cached",
        "note": "Current news context is displayed separately and is not used by the forecasting model.",
    }


def _simulated_news() -> dict[str, Any]:
    cache = _default_cache()
    cached = cache.get(SIMULATED_CACHE_KEY)
    if cached is not None and cached.is_fresh:
        payload = dict(cached.payload)
        payload["meta"] = {
            "fetchedAt": cached.fetched_at.replace(microsecond=0).isoformat(),
            "cacheStatus": "hit",
            "isStale": False,
        }
        return payload

    try:
        workbook = get_simulated_workbook()
    except SimulatedDataError as exc:
        return _unavailable(exc.message, mode="unavailable", reason_code=exc.reason)

    articles = [item.to_dict() for item in workbook.news_context]
    payload = {
        "available": True,
        "articles": articles,
        "aggregate": {
            "n_articles": len(articles),
            "avg_score": _avg_score(articles),
        },
        "meta": {
            "cacheStatus": "miss",
            "isStale": False,
        },
        "mode": "simulated",
        "source": "simulated_workbook",
        "data_classification": workbook.scenario.data_classification,
        "disclaimer": workbook.scenario.warning or SIMULATED_DATA_DISCLAIMER,
        "note": (
            "Simulated news context is fictional and is not used by the forecasting model."
        ),
    }
    cache.put(
        SIMULATED_CACHE_KEY,
        {k: v for k, v in payload.items() if k != "meta"},
        SIMULATED_TTL_SECONDS,
    )
    return payload


def _unavailable(
    reason: str,
    *,
    mode: str | None = None,
    reason_code: str | None = None,
) -> dict[str, Any]:
    payload = {
        "available": False,
        "reason": reason,
        "note": "Current news context is displayed separately and is not used by the forecasting model.",
    }
    if mode is not None:
        payload["mode"] = mode
    if reason_code is not None:
        payload["reason_code"] = reason_code
    return payload


def _pick_relevance(ticker_sentiment: list[dict[str, Any]], ticker: str) -> float | None:
    for row in ticker_sentiment or []:
        if str(row.get("ticker", "")).upper() == ticker:
            try:
                return float(row.get("relevance_score"))
            except (TypeError, ValueError):
                return None
    return None


def _avg_score(articles: list[dict[str, Any]]) -> float | None:
    scores = []
    for a in articles:
        try:
            scores.append(float(a.get("overall_sentiment_score")))
        except (TypeError, ValueError):
            continue
    if not scores:
        return None
    return sum(scores) / len(scores)
