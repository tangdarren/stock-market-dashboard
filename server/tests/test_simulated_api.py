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
def test_simulated_forecast_uses_workbook_without_model_artifacts(httpx_mock):
    """Simulated forecasts must work even when trained joblibs are absent."""
    from app.ml.simulated import clear_simulated_workbook_cache

    clear_simulated_workbook_cache()
    with _client() as client:
        r = client.get("/api/v1/forecasts/spy", params={"simulated": True})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "simulated"
    assert body["source"] == "simulated_workbook"
    assert body["model_unavailable"] is False
    assert "SIMULATED" in body.get("data_classification", "").upper()
    assert body["one_day"] is not None
    assert body["five_day"] is not None
    assert body["one_day"]["horizon_days"] == 1
    assert body["five_day"]["horizon_days"] == 5
    assert body["one_day"]["features_as_of"] == body["features_as_of"]
    assert body["five_day"]["features_as_of"] == body["features_as_of"]
    assert "synthetic" in body["one_day"]["model_name"]
    assert "synthetic" in body["five_day"]["model_name"]
    assert "actual" not in body["one_day"]
    assert "realized_return" not in body["one_day"]
    assert body["one_day"]["explanations"]["method"]
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_live_forecast_still_requires_artifacts_without_falling_back(httpx_mock):
    """Turning simulated off must keep the live artifact path (no workbook fill-in)."""
    with _client() as client:
        live = client.get("/api/v1/forecasts/spy")
        simulated = client.get("/api/v1/forecasts/spy", params={"simulated": True})
    assert live.status_code == 200
    live_body = live.json()
    assert live_body["mode"] == "model_unavailable"
    assert live_body["model_unavailable"] is True
    assert live_body["one_day"] is None

    sim_body = simulated.json()
    assert sim_body["mode"] == "simulated"
    assert sim_body["model_unavailable"] is False
    assert sim_body["one_day"] is not None
    assert httpx_mock.get_requests() == []


@pytest.mark.skipif(not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing")
def test_missing_current_forecast_returns_simulated_error_not_model_unavailable(
    tmp_path, monkeypatch, httpx_mock
):
    import pandas as pd

    from app.ml import simulated as simulated_module
    from app.ml.simulated import clear_simulated_workbook_cache

    market = pd.DataFrame(
        {
            "date": pd.bdate_range("2024-11-27", periods=5),
            "open": [100.0, 101.0, 102.0, 103.0, 104.0],
            "high": [101.0, 102.0, 103.0, 104.0, 105.0],
            "low": [99.0, 100.0, 101.0, 102.0, 103.0],
            "close": [100.5, 101.5, 102.5, 103.5, 104.5],
            "volume": [1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000],
        }
    )
    forecasts_rows: list[dict[str, object]] = []
    for ts in market["date"]:
        for horizon in (1, 5):
            forecasts_rows.append(
                {
                    "date": ts,
                    "horizon_days": horizon,
                    "prob_up": 0.55,
                    "predicted": 1,
                    "actual": 1,
                    "correct": 1,
                    "realized_return": 0.01,
                }
            )
    scenario = pd.DataFrame(
        [
            ["Field", "Value"],
            ["Scenario name", "Unit Test Scenario"],
            ["Symbol", "SPY"],
            ["Data classification", "SIMULATED / FICTIONAL"],
            ["Random seed", 20260805],
            ["First market date", market["date"].iloc[0]],
            ["Latest market date", market["date"].iloc[-1]],
            ["Market rows", len(market)],
            ["Forecast rows", len(forecasts_rows)],
        ]
    )
    news = pd.DataFrame(
        {
            "title": ["Synthetic headline"],
            "url": ["https://example.com/simulated/1"],
            "source": ["Simulation Wire"],
            "time_published": ["2026-08-04T16:15:00"],
            "overall_sentiment_label": ["Neutral"],
            "overall_sentiment_score": [0.01],
            "ticker_relevance": [0.9],
        }
    )
    labels = pd.DataFrame(
        {
            "date": market["date"],
            "regime": ["calm_uptrend"] * len(market),
            "note": ["Synthetic scenario row"] * len(market),
        }
    )
    path = tmp_path / "no_current_api.xlsx"
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        scenario.to_excel(writer, sheet_name="Scenario", index=False, header=False)
        market.to_excel(writer, sheet_name="Market_Data", index=False)
        pd.DataFrame(forecasts_rows).to_excel(
            writer, sheet_name="Forecast_History", index=False
        )
        news.to_excel(writer, sheet_name="News_Context", index=False)
        labels.to_excel(writer, sheet_name="Scenario_Labels", index=False)

    monkeypatch.setattr(simulated_module, "default_workbook_path", lambda: path)
    clear_simulated_workbook_cache()

    with _client() as client:
        forecast = client.get("/api/v1/forecasts/spy", params={"simulated": True})
        market_resp = client.get("/api/v1/market/spy", params={"simulated": True})

    assert forecast.status_code == 200
    body = forecast.json()
    assert body["mode"] == "simulated"
    assert body["model_unavailable"] is False
    assert body["reason"] == "simulated_current_forecast_missing"
    assert body["one_day"] is None
    assert body["five_day"] is None
    assert body["source"] == "simulated_workbook"

    # Market (and other workbook sections) should still render.
    assert market_resp.status_code == 200
    assert market_resp.json()["mode"] == "simulated"
    assert market_resp.json()["latest"] is not None
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
