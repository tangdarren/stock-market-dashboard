"""Compute historical SPY analogues for the latest completed session.

This service wires the trusted on-disk SPY history (produced by
``server/scripts/bootstrap_history.py``) into the leakage-safe analogue engine
in :mod:`app.ml.analogues`, using the latest completed-session snapshot from
:mod:`app.services.market_service` as the query.

Design notes
------------
* **No new Alpha Vantage call**: results are derived from the same cached
  market snapshot used by other endpoints. If that snapshot is fresh, no
  upstream HTTP request is made.
* **No model retraining and no artifact loading**: analogue analysis is a
  descriptive lookup and never touches ``joblib`` model files.
* **Cache-by-completed-session**: results are keyed by
  ``symbol + features_as_of + feature schema fingerprint + limit`` and
  invalidate naturally when the day advances.
* **Truthful failures**: every soft failure returns a structured payload with
  ``available: false`` and a machine-readable ``reason``. Uncaught errors are
  logged; the endpoint never fabricates analogues.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from fastapi import Depends

from app import config as _config
from app.ml.analogues import (
    ANALOGUE_DISCLAIMER,
    DEFAULT_FEATURE_NAMES,
    DISTANCE_METHODOLOGY,
    AnalogueRecord,
    AnalogueResult,
    find_historical_analogues,
)
from app.ml.features import build_features, latest_feature_row
from app.ml.normalize import OHLCVSchemaError, normalize_ohlcv
from app.ml.targets import add_targets
from app.services.cache import TTLCache
from app.services.market_service import (
    MarketDataUnavailable,
    MarketService,
    _default_cache,
    get_market_service,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

MIN_LIMIT = 3
MAX_LIMIT = 10
DEFAULT_LIMIT = 5
MINIMUM_SEPARATION_DAYS = 20

# Analogue results for a completed session are static; a day-long TTL is safe
# and the cache key includes the session date so results invalidate naturally
# when the day rolls over.
ANALOGUE_CACHE_TTL_SECONDS = 24 * 60 * 60

HISTORICAL_CSV_FILENAME = "spy_daily.csv"

METHOD_NAME = "standardized_euclidean_nearest_neighbors"

# Short fingerprint of the analogue feature list. Baked into the cache key so
# any edit to the feature set forces recomputation instead of returning stale
# results for a schema that no longer applies.
FEATURE_SCHEMA_VERSION = hashlib.sha1(
    (",".join(DEFAULT_FEATURE_NAMES) + f":sep={MINIMUM_SEPARATION_DAYS}").encode("utf-8")
).hexdigest()[:8]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class _AnalogueUnavailable(RuntimeError):
    """Raised internally to short-circuit into a structured unavailable response."""

    def __init__(self, message: str, *, reason: str):
        super().__init__(message)
        self.reason = reason


class AnalogueService:
    def __init__(self, *, market_service: MarketService, cache: TTLCache):
        self._market = market_service
        self._cache = cache

    async def get_spy_analogues(self, *, limit: int) -> dict[str, Any]:
        """Return the top-``limit`` analogues for the latest completed SPY session.

        Never raises for expected failure modes (missing history, missing
        market data, insufficient observations, feature-schema drift) — those
        are surfaced as ``available: false`` with a ``reason`` string.
        """
        if not (MIN_LIMIT <= limit <= MAX_LIMIT):
            # Defensive check; the API layer also enforces this via Query bounds.
            raise ValueError(
                f"limit must be between {MIN_LIMIT} and {MAX_LIMIT}, got {limit}"
            )

        # (1) Reuse the shared market snapshot. If the cache is fresh no
        # Alpha Vantage HTTP request happens; if no API key is set, a cached
        # payload is returned in "cached" mode; otherwise the service raises
        # MarketDataUnavailable and we produce a structured unavailable response.
        try:
            market = await self._market.get_spy_daily()
        except MarketDataUnavailable as exc:
            return _unavailable(
                reason="market_data_unavailable",
                detail=str(exc),
                query_date=None,
                data_as_of=None,
                mode="unavailable",
            )

        features_as_of = market.get("features_as_of")
        data_as_of = market.get("data_as_of")
        market_mode = market.get("mode", "unavailable")
        if not features_as_of:
            return _unavailable(
                reason="market_data_unavailable",
                detail="Latest completed-session date is unavailable.",
                query_date=None,
                data_as_of=data_as_of,
                mode="unavailable",
            )

        # (2) Cache short-circuit. Analogues for a given (session, schema, limit)
        # are immutable, so we serve the cached core payload and overlay the
        # current market mode/data_as_of + cache_status at read time.
        cache_key = _cache_key(features_as_of, limit)
        cached_entry = self._cache.get(cache_key)
        if cached_entry is not None and cached_entry.is_fresh:
            return _finalize_payload(
                cached_entry.payload,
                mode=market_mode,
                data_as_of=data_as_of,
                cache_status="hit",
            )

        # (3) Load the trusted local dataset. All soft failures below funnel
        # through _AnalogueUnavailable so we never leak a stack trace.
        try:
            historical = _load_historical_features()
            query_row = _build_query_row(market)
            result = find_historical_analogues(
                historical,
                query_row,
                pd.Timestamp(features_as_of).normalize(),
                top_k=limit,
                minimum_separation_days=MINIMUM_SEPARATION_DAYS,
            )
        except _AnalogueUnavailable as exc:
            return _unavailable(
                reason=exc.reason,
                detail=str(exc),
                query_date=features_as_of,
                data_as_of=data_as_of,
                mode="unavailable",
            )
        except ValueError as exc:
            # find_historical_analogues raises ValueError with the offending
            # column name(s) baked into the message. Surface it as a schema
            # mismatch rather than a 500.
            logger.warning("Analogue feature schema mismatch: %s", exc)
            return _unavailable(
                reason="feature_schema_mismatch",
                detail=str(exc),
                query_date=features_as_of,
                data_as_of=data_as_of,
                mode="unavailable",
            )

        if result.summary is None or result.summary.candidate_pool_size == 0:
            return _unavailable(
                reason="insufficient_observations",
                detail=(
                    "Not enough eligible historical sessions in the local "
                    "dataset to compute analogues for this query."
                ),
                query_date=features_as_of,
                data_as_of=data_as_of,
                mode="unavailable",
            )

        core = _build_core_payload(result=result, limit=limit, query_date=features_as_of)
        self._cache.put(cache_key, core, ANALOGUE_CACHE_TTL_SECONDS)
        return _finalize_payload(
            core, mode=market_mode, data_as_of=data_as_of, cache_status="miss"
        )


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def _load_historical_features() -> pd.DataFrame:
    """Read the local SPY dataset, engineer features, and attach realized targets.

    Raises :class:`_AnalogueUnavailable` when the dataset is missing, malformed,
    or too small to produce any complete feature rows.
    """
    csv_path = _config.DATA_RAW_DIR / HISTORICAL_CSV_FILENAME
    if not csv_path.exists():
        raise _AnalogueUnavailable(
            "Local SPY history is not present. Run "
            "`python server/scripts/bootstrap_history.py` first.",
            reason="historical_dataset_missing",
        )

    try:
        raw = pd.read_csv(csv_path)
    except (pd.errors.ParserError, ValueError, UnicodeDecodeError) as exc:
        raise _AnalogueUnavailable(
            f"Local SPY history is malformed: {exc}",
            reason="historical_dataset_malformed",
        ) from exc

    try:
        canonical = normalize_ohlcv(raw, source=f"local_csv:{HISTORICAL_CSV_FILENAME}")
    except OHLCVSchemaError as exc:
        raise _AnalogueUnavailable(
            f"Local SPY history failed schema validation: {exc}",
            reason="historical_dataset_malformed",
        ) from exc

    features = build_features(canonical)
    with_targets = add_targets(features)
    return with_targets


def _build_query_row(market: dict[str, Any]) -> pd.Series:
    """Derive the query feature vector from the current market snapshot."""
    series = market.get("series")
    if not series:
        raise _AnalogueUnavailable(
            "Current market series is empty; cannot compute the query vector.",
            reason="market_data_unavailable",
        )
    frame = pd.DataFrame(series)
    frame["date"] = pd.to_datetime(frame["date"])
    features_df = build_features(frame)
    try:
        return latest_feature_row(features_df)
    except ValueError as exc:
        raise _AnalogueUnavailable(
            f"Not enough recent market history to build a complete feature row: {exc}",
            reason="insufficient_history",
        ) from exc


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------


def _cache_key(features_as_of: str, limit: int) -> str:
    return f"analogues:SPY:{features_as_of}:v={FEATURE_SCHEMA_VERSION}:limit={limit}"


def _build_core_payload(
    *,
    result: AnalogueResult,
    limit: int,
    query_date: str,
) -> dict[str, Any]:
    """Return the immutable portion of the payload (safe to cache)."""
    summary = result.summary
    assert summary is not None  # caller guarantees non-empty pool
    return {
        "available": True,
        "symbol": "SPY",
        "query_date": query_date,
        "features_as_of": query_date,
        "limit": limit,
        "methodology": {
            "method": METHOD_NAME,
            "distance": DISTANCE_METHODOLOGY,
            "features": list(summary.feature_names),
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
            "minimum_separation_days": summary.minimum_separation_days,
            "candidate_pool_size": summary.candidate_pool_size,
        },
        "summary": {
            "analogue_count": summary.n_analogues,
            "positive_after_1d_pct": summary.pct_positive_1d,
            "positive_after_5d_pct": summary.pct_positive_5d,
            "median_return_1d": summary.median_return_1d,
            "median_return_5d": summary.median_return_5d,
            "avg_return_1d": summary.avg_return_1d,
            "avg_return_5d": summary.avg_return_5d,
        },
        "analogues": [_serialize_analogue(a) for a in result.analogues],
        "disclaimer": ANALOGUE_DISCLAIMER,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }


def _finalize_payload(
    core: dict[str, Any],
    *,
    mode: str,
    data_as_of: str | None,
    cache_status: str,
) -> dict[str, Any]:
    """Overlay the mutable market metadata onto a (possibly cached) core payload."""
    payload = dict(core)
    payload["mode"] = mode
    payload["data_as_of"] = data_as_of
    payload["cache_status"] = cache_status
    return payload


def _serialize_analogue(record: AnalogueRecord) -> dict[str, Any]:
    return {
        "date": record.date,
        "similarity": record.similarity_0_100,
        "distance": record.distance,
        "close": record.close,
        "return_1d": record.realized_return_1d,
        "return_5d": record.realized_return_5d,
        "direction_1d": record.direction_1d,
        "direction_5d": record.direction_5d,
        "rsi_14": record.rsi_14,
        "rolling_vol_20": record.rolling_vol_20,
        "distance_from_sma_20": record.distance_from_sma_20,
        "relative_volume": record.relative_volume,
    }


def _unavailable(
    *,
    reason: str,
    detail: str,
    query_date: str | None,
    data_as_of: str | None,
    mode: str,
) -> dict[str, Any]:
    """Structured 'panel unavailable' response — never fabricates analogues."""
    return {
        "available": False,
        "symbol": "SPY",
        "query_date": query_date,
        "features_as_of": query_date,
        "data_as_of": data_as_of,
        "limit": None,
        "methodology": {
            "method": METHOD_NAME,
            "features": list(DEFAULT_FEATURE_NAMES),
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
            "minimum_separation_days": MINIMUM_SEPARATION_DAYS,
        },
        "summary": None,
        "analogues": [],
        "disclaimer": ANALOGUE_DISCLAIMER,
        "mode": mode,
        "cache_status": "bypass",
        "reason": reason,
        "detail": detail,
    }


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_analogue_service(
    market_service: MarketService = Depends(get_market_service),
) -> AnalogueService:
    return AnalogueService(market_service=market_service, cache=_default_cache())


__all__ = [
    "ANALOGUE_CACHE_TTL_SECONDS",
    "DEFAULT_LIMIT",
    "FEATURE_SCHEMA_VERSION",
    "HISTORICAL_CSV_FILENAME",
    "MAX_LIMIT",
    "METHOD_NAME",
    "MINIMUM_SEPARATION_DAYS",
    "MIN_LIMIT",
    "AnalogueService",
    "get_analogue_service",
]
