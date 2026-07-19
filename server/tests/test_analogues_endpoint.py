"""End-to-end tests for GET /api/v1/market/spy/analogues.

All Alpha Vantage traffic is stubbed. When the test doesn't want *any*
upstream request to fire it pre-warms the market cache directly and never
registers an ``httpx_mock`` response — so a stray HTTP call would fail the
test with an unmatched-request error.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.analogues import ANALOGUE_DISCLAIMER, DEFAULT_FEATURE_NAMES
from app.services.analogue_service import (
    FEATURE_SCHEMA_VERSION,
    HISTORICAL_CSV_FILENAME,
    MINIMUM_SEPARATION_DAYS,
)
from app.services.market_service import SPY_TIMESERIES_CACHE_KEY, _default_cache

# ---------------------------------------------------------------------------
# Deterministic synthetic dataset
# ---------------------------------------------------------------------------


def _synthetic_ohlcv(n: int, seed: int, end: str = "2024-06-14") -> pd.DataFrame:
    """Random-walk OHLCV frame ending on ``end`` (business days)."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(end=end, periods=n)
    close = np.cumsum(rng.normal(0, 1.0, size=n)) + 500.0
    close = np.abs(close) + 100.0  # keep prices positive
    open_ = close + rng.normal(0, 0.4, size=n)
    high = np.maximum(open_, close) + rng.uniform(0.1, 1.5, size=n)
    low = np.minimum(open_, close) - rng.uniform(0.1, 1.5, size=n)
    volume = rng.integers(40_000_000, 90_000_000, size=n)
    return pd.DataFrame(
        {
            "date": dates,
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )


def _write_historical_csv(rows: int = 600, seed: int = 11, end: str = "2024-06-14") -> None:
    """Persist a synthetic history to the (monkeypatched) DATA_RAW_DIR."""
    from app import config as _config

    frame = _synthetic_ohlcv(rows, seed=seed, end=end)
    path = _config.DATA_RAW_DIR / HISTORICAL_CSV_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False)


def _av_payload_from_frame(frame: pd.DataFrame) -> dict:
    """Serialize an OHLCV frame into an Alpha Vantage TIME_SERIES_DAILY payload."""
    series: dict[str, dict[str, str]] = {}
    for _, row in frame.iterrows():
        series[row["date"].strftime("%Y-%m-%d")] = {
            "1. open": f"{row['open']:.4f}",
            "2. high": f"{row['high']:.4f}",
            "3. low": f"{row['low']:.4f}",
            "4. close": f"{row['close']:.4f}",
            "5. volume": str(int(row["volume"])),
        }
    return {"Time Series (Daily)": series}


def _prewarm_market_cache(payload: dict, ttl_seconds: int = 6 * 60 * 60) -> None:
    """Put a fresh SPY snapshot into the shared cache so no HTTP call fires."""
    _default_cache().put(SPY_TIMESERIES_CACHE_KEY, payload, ttl_seconds)


def _client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def with_configured_key(monkeypatch):
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "TESTKEY")
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_successful_endpoint_response(with_configured_key):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200
    body = r.json()

    assert body["available"] is True
    assert body["symbol"] == "SPY"
    assert body["query_date"] == body["features_as_of"]
    assert body["query_date"]  # non-empty ISO date string
    assert body["mode"] in {"live", "cached", "stale"}
    assert body["cache_status"] in {"miss", "hit"}
    assert body["disclaimer"] == ANALOGUE_DISCLAIMER

    methodology = body["methodology"]
    assert methodology["method"] == "standardized_euclidean_nearest_neighbors"
    assert methodology["features"] == list(DEFAULT_FEATURE_NAMES)
    assert methodology["feature_schema_version"] == FEATURE_SCHEMA_VERSION
    assert methodology["minimum_separation_days"] == MINIMUM_SEPARATION_DAYS
    assert methodology["candidate_pool_size"] > 0

    summary = body["summary"]
    assert summary["analogue_count"] == len(body["analogues"]) == 5
    for key in (
        "positive_after_1d_pct",
        "positive_after_5d_pct",
        "median_return_1d",
        "median_return_5d",
        "avg_return_1d",
        "avg_return_5d",
    ):
        assert summary[key] is not None
    assert 0.0 <= summary["positive_after_1d_pct"] <= 100.0
    assert 0.0 <= summary["positive_after_5d_pct"] <= 100.0

    for analogue in body["analogues"]:
        assert 0.0 <= analogue["similarity"] <= 100.0
        assert analogue["distance"] >= 0.0
        assert analogue["direction_1d"] in {"up", "down"}
        assert analogue["direction_5d"] in {"up", "down"}
        assert isinstance(analogue["date"], str) and len(analogue["date"]) == 10


def test_disclaimer_present_on_success(with_configured_key):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")
    assert r.json()["disclaimer"] == ANALOGUE_DISCLAIMER


def test_disclaimer_present_on_failure(with_configured_key):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    # Deliberately no historical CSV -> panel-level unavailable response.

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")
    body = r.json()
    assert body["available"] is False
    assert body["disclaimer"] == ANALOGUE_DISCLAIMER


def test_analogue_dates_precede_query_date(with_configured_key):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues?limit=10")
    body = r.json()
    assert body["available"] is True

    query_date = pd.Timestamp(body["query_date"])
    min_sep = pd.Timedelta(days=body["methodology"]["minimum_separation_days"])
    for analogue in body["analogues"]:
        candidate_date = pd.Timestamp(analogue["date"])
        assert candidate_date < query_date
        # Temporal separation guard is honored end-to-end.
        assert (query_date - candidate_date) >= min_sep


# ---------------------------------------------------------------------------
# Limit validation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("limit", [2, 11, 0, -1, 100])
def test_out_of_range_limit_returns_422(with_configured_key, limit):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get(f"/api/v1/market/spy/analogues?limit={limit}")
    assert r.status_code == 422  # FastAPI Query bounds enforcement


@pytest.mark.parametrize("limit", [3, 5, 7, 10])
def test_in_range_limit_returns_requested_count(with_configured_key, limit):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get(f"/api/v1/market/spy/analogues?limit={limit}")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["limit"] == limit
    assert len(body["analogues"]) == limit


# ---------------------------------------------------------------------------
# Failure surfaces
# ---------------------------------------------------------------------------


def test_unavailable_historical_data_returns_structured_response(with_configured_key):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    # NOTE: no historical CSV written.

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200  # panel-level unavailability, not a 5xx
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "historical_dataset_missing"
    assert body["analogues"] == []
    assert body["summary"] is None
    assert body["mode"] == "unavailable"
    # Sanitized: no stack trace, no path leaking secrets.
    assert "Traceback" not in body["detail"]


def test_market_data_unavailable_short_circuits():
    # No API key configured (autouse fixture deletes env var) and no cached
    # market snapshot -> MarketDataUnavailable -> structured unavailable.
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "market_data_unavailable"
    assert body["mode"] == "unavailable"


def test_feature_schema_mismatch_is_sanitized(with_configured_key, monkeypatch):
    """A historical frame missing a required feature column surfaces gracefully."""
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    # Force the loader to drop one of the required feature columns before the
    # engine sees it. This exercises the ValueError -> feature_schema_mismatch
    # translation without touching the on-disk feature schema.
    from app.services import analogue_service as svc

    original_loader = svc._load_historical_features

    def _broken_loader() -> pd.DataFrame:
        df = original_loader()
        return df.drop(columns=["rsi_14"])

    monkeypatch.setattr(svc, "_load_historical_features", _broken_loader)

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "feature_schema_mismatch"
    assert "rsi_14" in body["detail"]
    assert body["analogues"] == []


def test_insufficient_observations_returns_truthful_empty(with_configured_key):
    """A history too short to produce any complete feature row must not fabricate analogues."""
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))

    # Fewer than 50 rows -> SMA_50 is NaN for every row, so the analogue
    # engine's "complete feature vector" guard rejects every candidate and the
    # eligible pool is empty.
    tiny = _synthetic_ohlcv(45, seed=11, end="2024-04-15")
    from app import config as _config

    tiny.to_csv(_config.DATA_RAW_DIR / HISTORICAL_CSV_FILENAME, index=False)

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "insufficient_observations"
    assert body["analogues"] == []


# ---------------------------------------------------------------------------
# Caching + no-extra-AV-request
# ---------------------------------------------------------------------------


def test_cache_reuse_on_second_call(with_configured_key, monkeypatch):
    """A second identical request must reuse the cached analogue payload."""
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    call_counter = {"n": 0}
    from app.services import analogue_service as svc

    original_finder = svc.find_historical_analogues

    def counting_finder(*args, **kwargs):
        call_counter["n"] += 1
        return original_finder(*args, **kwargs)

    monkeypatch.setattr(svc, "find_historical_analogues", counting_finder)

    with _client() as client:
        first = client.get("/api/v1/market/spy/analogues?limit=5").json()
        second = client.get("/api/v1/market/spy/analogues?limit=5").json()

    assert first["available"] and second["available"]
    assert first["cache_status"] == "miss"
    assert second["cache_status"] == "hit"
    assert call_counter["n"] == 1  # engine ran exactly once

    # Analogue records themselves are byte-for-byte identical between calls.
    assert first["analogues"] == second["analogues"]
    assert first["summary"] == second["summary"]


def test_different_limits_get_separate_cache_entries(with_configured_key, monkeypatch):
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    call_counter = {"n": 0}
    from app.services import analogue_service as svc

    original_finder = svc.find_historical_analogues

    def counting_finder(*args, **kwargs):
        call_counter["n"] += 1
        return original_finder(*args, **kwargs)

    monkeypatch.setattr(svc, "find_historical_analogues", counting_finder)

    with _client() as client:
        client.get("/api/v1/market/spy/analogues?limit=5")
        client.get("/api/v1/market/spy/analogues?limit=7")
        client.get("/api/v1/market/spy/analogues?limit=5")  # cache hit
        client.get("/api/v1/market/spy/analogues?limit=7")  # cache hit

    assert call_counter["n"] == 2  # once per distinct limit


def test_no_extra_alpha_vantage_request_when_market_cache_is_fresh(
    with_configured_key, httpx_mock
):
    """The analogue endpoint must not consume an upstream Alpha Vantage call.

    We intentionally register ZERO ``httpx_mock`` responses; any HTTP request
    to Alpha Vantage would raise an unmatched-request error and fail the test.
    """
    market_frame = _synthetic_ohlcv(90, seed=7, end="2024-06-14")
    _prewarm_market_cache(_av_payload_from_frame(market_frame))
    _write_historical_csv(rows=600, seed=11, end="2024-06-14")

    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues")

    assert r.status_code == 200
    assert r.json()["available"] is True
    # Nothing went out.
    assert httpx_mock.get_requests() == []
