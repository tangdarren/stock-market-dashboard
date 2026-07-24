"""Provide the latest completed SPY snapshot with cache-aware metadata."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from functools import lru_cache
from typing import Any

import pandas as pd
from fastapi import Depends

from app import config as _config
from app.clients.alpha_vantage import (
    AlphaVantageClient,
    AlphaVantageError,
    AlphaVantageMissingKeyError,
    AlphaVantageThrottledError,
)
from app.config import Settings, get_settings
from app.ml.normalize import normalize_alpha_vantage_daily
from app.ml.simulated import (
    SIMULATED_DATA_DISCLAIMER,
    SimulatedDataError,
    get_simulated_workbook,
)
from app.services.cache import TTLCache
from app.services.rate_limiter import RateLimiter, RateLimitError
from app.services.session import latest_completed_session
from app.storage.database import Database

logger = logging.getLogger(__name__)

SPY_TIMESERIES_CACHE_KEY = "alpha_vantage:time_series_daily:SPY"
SPY_TIMESERIES_TTL_SECONDS = 6 * 60 * 60  # 6 hours
SIMULATED_TIMESERIES_CACHE_KEY = "simulated:time_series_daily:SPY"
SIMULATED_TIMESERIES_TTL_SECONDS = 24 * 60 * 60


class MarketDataUnavailable(RuntimeError):
    """Raised when neither live nor cached data is available."""

    def __init__(self, message: str, *, reason: str = "unavailable"):
        super().__init__(message)
        self.reason = reason


class MarketService:
    def __init__(
        self,
        *,
        settings: Settings,
        cache: TTLCache,
        rate_limiter: RateLimiter,
    ):
        self._settings = settings
        self._cache = cache
        self._rate_limiter = rate_limiter

    def has_cached_snapshot(self) -> bool:
        return self._cache.get(SPY_TIMESERIES_CACHE_KEY) is not None

    async def get_spy_daily(self, *, simulated: bool = False) -> dict[str, Any]:
        """Return the latest completed SPY daily snapshot with metadata.

        Live Alpha Vantage is the default. Pass ``simulated=True`` to serve the
        synthetic workbook instead — never used as a silent live fallback.
        """
        if simulated:
            return self._get_spy_daily_simulated()
        return await self._get_spy_daily_live()

    def _get_spy_daily_simulated(self) -> dict[str, Any]:
        cached = self._cache.get(SIMULATED_TIMESERIES_CACHE_KEY)
        if cached is not None and cached.is_fresh:
            payload = dict(cached.payload)
            payload["cache"] = {
                "fetchedAt": cached.fetched_at.replace(microsecond=0).isoformat(),
                "cacheStatus": "hit",
                "isStale": False,
            }
            return payload

        try:
            workbook = get_simulated_workbook()
        except SimulatedDataError as exc:
            raise MarketDataUnavailable(exc.message, reason=exc.reason) from exc

        response = _build_frame_response(
            workbook.market_data,
            mode="simulated",
            is_stale=False,
            source="simulated_workbook",
            cache_meta={
                "fetchedAt": datetime.now(timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "cacheStatus": "miss",
                "isStale": False,
            },
            filter_to_completed_session=False,
        )
        response["disclaimer"] = workbook.scenario.warning or SIMULATED_DATA_DISCLAIMER
        response["scenario_name"] = workbook.scenario.scenario_name
        response["data_classification"] = workbook.scenario.data_classification
        self._cache.put(
            SIMULATED_TIMESERIES_CACHE_KEY,
            {k: v for k, v in response.items() if k != "cache"},
            SIMULATED_TIMESERIES_TTL_SECONDS,
        )
        return response

    async def _get_spy_daily_live(self) -> dict[str, Any]:
        if not self._settings.has_api_key:
            cached = self._cache.get(SPY_TIMESERIES_CACHE_KEY)
            if cached is not None:
                return self._build_response(
                    cached.payload,
                    mode="cached",
                    is_stale=True,
                    cache_meta={
                        "fetchedAt": cached.fetched_at.replace(microsecond=0).isoformat(),
                        "cacheStatus": "hit_no_key",
                        "isStale": True,
                    },
                )
            raise MarketDataUnavailable(
                "Alpha Vantage API key is not configured.",
                reason="missing_api_key",
            )

        async def _fetch() -> dict[str, Any]:
            try:
                self._rate_limiter.ensure_can_call()
            except RateLimitError as exc:
                raise AlphaVantageError(
                    f"Backend rate limit reached ({exc}). "
                    f"Try again later."
                ) from exc

            async with AlphaVantageClient(self._settings.alpha_vantage_api_key) as client:
                payload = await client.daily_time_series("SPY", outputsize="compact")

            self._rate_limiter.record_call()
            return payload

        try:
            payload, meta = await self._cache.get_or_fetch(
                SPY_TIMESERIES_CACHE_KEY,
                ttl_seconds=SPY_TIMESERIES_TTL_SECONDS,
                fetch=_fetch,
            )
        except AlphaVantageMissingKeyError as exc:
            raise MarketDataUnavailable(str(exc), reason="missing_api_key") from exc
        except AlphaVantageThrottledError as exc:
            cached = self._cache.get(SPY_TIMESERIES_CACHE_KEY)
            if cached is not None:
                return self._build_response(
                    cached.payload,
                    mode="stale",
                    is_stale=True,
                    cache_meta={
                        "fetchedAt": cached.fetched_at.replace(microsecond=0).isoformat(),
                        "cacheStatus": "throttled_fallback",
                        "isStale": True,
                    },
                )
            raise MarketDataUnavailable(str(exc), reason="throttled") from exc
        except AlphaVantageError as exc:
            cached = self._cache.get(SPY_TIMESERIES_CACHE_KEY)
            if cached is not None:
                return self._build_response(
                    cached.payload,
                    mode="stale",
                    is_stale=True,
                    cache_meta={
                        "fetchedAt": cached.fetched_at.replace(microsecond=0).isoformat(),
                        "cacheStatus": "error_fallback",
                        "isStale": True,
                    },
                )
            raise MarketDataUnavailable(str(exc), reason="upstream_error") from exc

        mode = "cached" if meta.get("cacheStatus") == "hit" else "live"
        return self._build_response(payload, mode=mode, is_stale=False, cache_meta=meta)

    def _build_response(
        self,
        payload: dict[str, Any],
        *,
        mode: str,
        is_stale: bool,
        cache_meta: dict[str, Any],
    ) -> dict[str, Any]:
        frame = normalize_alpha_vantage_daily(payload)
        return _build_frame_response(
            frame,
            mode=mode,
            is_stale=is_stale,
            source="alpha_vantage",
            cache_meta=cache_meta,
            filter_to_completed_session=True,
        )


def _build_frame_response(
    frame: pd.DataFrame,
    *,
    mode: str,
    is_stale: bool,
    source: str,
    cache_meta: dict[str, Any],
    filter_to_completed_session: bool,
) -> dict[str, Any]:
    working = frame.copy()
    working["date"] = pd.to_datetime(working["date"])
    target_session = latest_completed_session()

    filtered = working
    if filter_to_completed_session:
        filtered = working[working["date"].dt.date <= target_session]
        if filtered.empty:
            filtered = working

    data_as_of: date = filtered["date"].iloc[-1].date()
    features_as_of = data_as_of

    if filter_to_completed_session and data_as_of < target_session:
        mode = "stale"
        is_stale = True

    series = filtered.tail(180).to_dict(orient="records")
    for row in series:
        row["date"] = row["date"].strftime("%Y-%m-%d")

    latest = series[-1] if series else None
    previous = series[-2] if len(series) >= 2 else None

    change = None
    change_percent = None
    if latest is not None and previous is not None:
        change = float(latest["close"] - previous["close"])
        change_percent = float(change / previous["close"] * 100)

    return {
        "series": series,
        "latest": latest,
        "previous": previous,
        "change": change,
        "change_percent": change_percent,
        "features_as_of": features_as_of.isoformat(),
        "data_as_of": data_as_of.isoformat(),
        "target_session": target_session.isoformat(),
        "source": source,
        "mode": mode,
        "is_stale": is_stale,
        "cache": cache_meta,
    }


@lru_cache(maxsize=1)
def _default_database() -> Database:
    _config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    return Database(_config.ARTIFACTS_DIR / "cache.db")


@lru_cache(maxsize=1)
def _default_cache() -> TTLCache:
    return TTLCache(_default_database())


@lru_cache(maxsize=1)
def _default_rate_limiter() -> RateLimiter:
    settings = get_settings()
    return RateLimiter(
        _default_database(),
        provider_key="alpha_vantage",
        daily_budget=settings.alpha_vantage_daily_budget,
        min_interval_seconds=settings.alpha_vantage_min_interval_seconds,
    )


def get_market_service(settings: Settings = Depends(get_settings)) -> MarketService:
    return MarketService(
        settings=settings,
        cache=_default_cache(),
        rate_limiter=_default_rate_limiter(),
    )
