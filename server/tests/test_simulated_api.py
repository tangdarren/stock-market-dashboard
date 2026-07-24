"""API tests for live vs simulated market/forecast/news/analogue modes."""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.simulated import SIMULATED_WORKBOOK_FILENAME

REPO_WORKBOOK = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "simulated"
    / SIMULATED_WORKBOOK_FILENAME
)


def _client() -> TestClient:
    return TestClient(create_app())


def _daily_payload() -> dict:
    return {
        "Time Series (Daily)": {
            "2024-06-07": {
                "1. open": "540.00",
                "2. high": "541.00",
                "3. low": "539.00",
                "4. close": "540.50",
                "5. volume": "50000000",
            },
            "2024-06-10": {
                "1. open": "542.00",
                "2. high": "543.00",
                "3. low": "541.00",
                "4. close": "542.50",
                "5. volume": "60000000",
            },
        }
    }


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_simulated_market_uses_workbook_without_api_key(httpx_mock):
    # No Alpha Vantage routes registered — any external call would fail the test.
    with _client() as client:
        r = client.get("/api/v1/market/spy", params={"simulated": True})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "simulated"
    assert body["source"] == "simulated_workbook"
    assert body["latest"] is not None
    assert len(body["series"]) >= 1
    assert "SIMULATED" in body.get("data_classification", "").upper()
    assert "synthetic" in body.get("disclaimer", "").lower()
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_live_market_default_unchanged_without_key():
    with _client() as client:
        r = client.get("/api/v1/market/spy")
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert detail["reason"] == "missing_api_key"
    assert detail["mode"] == "unavailable"


def test_live_market_still_uses_alpha_vantage(monkeypatch, httpx_mock):
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "TESTKEY")
    from app.config import get_settings

    get_settings.cache_clear()
    httpx_mock.add_response(
        method="GET",
        url=httpx.URL(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": "SPY",
                "outputsize": "compact",
                "apikey": "TESTKEY",
            },
        ),
        json=_daily_payload(),
        is_optional=True,
    )
    with _client() as client:
        r = client.get("/api/v1/market/spy")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] in ("live", "cached", "stale")
    assert body["source"] == "alpha_vantage"
    assert body["mode"] != "simulated"


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_simulated_news_returns_workbook_articles_without_external_calls(httpx_mock):
    with _client() as client:
        r = client.get("/api/v1/news/spy", params={"simulated": True})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["mode"] == "simulated"
    assert body["source"] == "simulated_workbook"
    assert len(body["articles"]) >= 1
    assert all(a.get("title") for a in body["articles"])
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_simulated_forecast_history_uses_workbook(httpx_mock):
    with _client() as client:
        r = client.get("/api/v1/forecasts/history", params={"simulated": True, "limit": 10})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "simulated"
    assert body["source"] == "simulated_workbook"
    assert body["count"] == len(body["records"])
    assert body["count"] > 0
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_simulated_forecast_marks_mode_when_models_available(
    tmp_path, monkeypatch, httpx_mock
):
    # Without trained models the endpoint still must not call Alpha Vantage and
    # should prefer simulated market context when models are present. Here we
    # only assert the no-network + simulated labeling path when forecast runs.
    from app.services import forecast_service as forecast_module

    async def _fake_forecast(self, *, simulated: bool = False):
        assert simulated is True
        market = await self._market.get_spy_daily(simulated=True)
        return {
            "one_day": {
                "horizon_days": 1,
                "prob_up": 0.55,
                "prob_down": 0.45,
                "direction": "up",
                "confidence": "low",
                "model_name": "test",
                "trained_at": "2026-01-01T00:00:00+00:00",
                "features_as_of": market["features_as_of"],
                "explanations": {"method": "test", "up": [], "down": [], "uncertainty": []},
            },
            "five_day": {
                "horizon_days": 5,
                "prob_up": 0.55,
                "prob_down": 0.45,
                "direction": "up",
                "confidence": "low",
                "model_name": "test",
                "trained_at": "2026-01-01T00:00:00+00:00",
                "features_as_of": market["features_as_of"],
                "explanations": {"method": "test", "up": [], "down": [], "uncertainty": []},
            },
            "features_as_of": market["features_as_of"],
            "data_as_of": market["data_as_of"],
            "mode": market["mode"],
            "is_stale": False,
            "disclaimer": "test",
            "model_unavailable": False,
            "source": market.get("source"),
            "data_classification": market.get("data_classification"),
        }

    monkeypatch.setattr(forecast_module.ForecastService, "forecast", _fake_forecast)

    with _client() as client:
        r = client.get("/api/v1/forecasts/spy", params={"simulated": True})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "simulated"
    assert body["source"] == "simulated_workbook"
    assert body["model_unavailable"] is False
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_simulated_analogues_use_workbook_history(httpx_mock):
    with _client() as client:
        r = client.get("/api/v1/market/spy/analogues", params={"simulated": True, "limit": 5})
    assert r.status_code == 200
    body = r.json()
    # Soft-unavailable is acceptable if the synthetic series is too short for
    # separation rules; when available it must be labeled simulated.
    if body.get("available"):
        assert body["mode"] == "simulated"
        assert body.get("source") == "simulated_workbook"
        assert len(body.get("analogues") or []) >= 1
    else:
        assert body.get("reason")
    assert httpx_mock.get_requests() == []
