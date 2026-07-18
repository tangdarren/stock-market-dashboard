"""End-to-end API tests using FastAPI TestClient + mocked Alpha Vantage."""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app.main import create_app


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


def _client() -> TestClient:
    app = create_app()
    return TestClient(app)


def test_health_shows_no_key(monkeypatch):
    monkeypatch.delenv("ALPHA_VANTAGE_API_KEY", raising=False)
    from app.config import get_settings

    get_settings.cache_clear()
    with _client() as client:
        r = client.get("/api/v1/health")
    body = r.json()
    assert r.status_code == 200
    assert body["alpha_vantage_configured"] is False
    assert "model_available" in body


def test_market_endpoint_returns_503_without_key():
    with _client() as client:
        r = client.get("/api/v1/market/spy")
    assert r.status_code == 503
    body = r.json()
    assert body["detail"]["reason"] == "missing_api_key"


def test_forecasts_endpoint_returns_model_unavailable_without_artifacts(monkeypatch):
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "TESTKEY")
    from app.config import get_settings

    get_settings.cache_clear()
    with _client() as client:
        r = client.get("/api/v1/forecasts/spy")
    body = r.json()
    assert r.status_code == 200
    assert body["mode"] == "model_unavailable"
    assert body["model_unavailable"] is True
    assert body["one_day"] is None
    assert body["five_day"] is None


def test_metrics_endpoint_503_when_no_artifacts():
    with _client() as client:
        r = client.get("/api/v1/model/metrics")
    assert r.status_code == 503


def test_market_endpoint_with_key_and_mocked_upstream(monkeypatch, httpx_mock):
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
    assert body["source"] == "alpha_vantage"
    assert body["mode"] in ("live", "cached", "stale")
    assert len(body["series"]) >= 1


def test_forecast_history_empty_when_no_artifacts():
    with _client() as client:
        r = client.get("/api/v1/forecasts/history")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 0
    assert body["records"] == []
