"""Simulated-mode coverage for metrics, monitoring, and Replay Lab."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.schemas import ModelMonitoringResponse, ReplayResultResponse, ReplaySessionResponse
from app.ml.simulated import SIMULATED_WORKBOOK_FILENAME, clear_simulated_workbook_cache
from app.ml.simulated_research import (
    SIMULATED_BACKTEST_DISCLAIMER,
    SIMULATED_METRICS_DISCLAIMER,
    SIMULATED_MODEL_VERSION,
    SIMULATED_MONITORING_DISCLAIMER,
    SIMULATED_REPLAY_DISCLAIMER,
    SIMULATED_SOURCE,
    clear_simulated_research_caches,
)
from app.services.replay_service import clear_replay_file_caches
from tests.replay_fixtures import assert_session_has_no_leakage

REPO_WORKBOOK = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "simulated"
    / SIMULATED_WORKBOOK_FILENAME
)

pytestmark = pytest.mark.skipif(
    not REPO_WORKBOOK.exists(), reason="repo simulated workbook missing"
)


def _client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture(autouse=True)
def _clear_sim_caches():
    clear_simulated_workbook_cache()
    clear_simulated_research_caches()
    clear_replay_file_caches()
    yield
    clear_simulated_workbook_cache()
    clear_simulated_research_caches()
    clear_replay_file_caches()


# ---------------------------------------------------------------------------
# Metrics + educational backtest
# ---------------------------------------------------------------------------


def test_simulated_metrics_both_horizons_and_backtest(httpx_mock):
    with _client() as client:
        r = client.get("/api/v1/model/metrics", params={"simulated": True})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "simulated"
    assert body["source"] == SIMULATED_SOURCE
    assert body["model_version"] == SIMULATED_MODEL_VERSION
    assert SIMULATED_METRICS_DISCLAIMER in body["disclaimer"]
    assert "1d" in body["horizons"] and "5d" in body["horizons"]

    for key in ("1d", "5d"):
        block = body["horizons"][key]
        holdout = block["holdout"]
        assert holdout["n_observations"] > 0
        assert 0.0 <= holdout["accuracy"] <= 1.0
        assert block["calibration"]
        assert block["selected_model"] == "simulated_scenario"

    backtest = body["horizons"]["1d"]["backtest"]
    assert backtest["available"] is True
    assert backtest["disclaimer"] == SIMULATED_BACKTEST_DISCLAIMER
    assert "fictional" in backtest["disclaimer"].lower()
    assert httpx_mock.get_requests() == []


def test_live_metrics_isolated_from_simulated(httpx_mock):
    # Live path still requires train artifacts; simulated must not fill the gap.
    with _client() as client:
        live = client.get("/api/v1/model/metrics")
        sim = client.get("/api/v1/model/metrics", params={"simulated": True})
    assert live.status_code == 503
    assert live.json()["detail"]["reason"] == "artifacts_missing"
    assert sim.status_code == 200
    assert sim.json()["mode"] == "simulated"
    assert httpx_mock.get_requests() == []


def test_simulated_metrics_unavailable_when_workbook_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.ml.simulated.default_workbook_path",
        lambda: tmp_path / "missing.xlsx",
    )
    clear_simulated_workbook_cache()
    clear_simulated_research_caches()
    with _client() as client:
        r = client.get("/api/v1/model/metrics", params={"simulated": True})
    assert r.status_code == 503
    assert r.json()["detail"]["reason"] == "simulated_workbook_missing"


# ---------------------------------------------------------------------------
# Monitoring (rolling + feature drift)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("horizon", ["1d", "5d"])
@pytest.mark.parametrize("window", [30, 60, 120, 252])
def test_simulated_monitoring_horizons_and_windows(horizon, window, httpx_mock):
    with _client() as client:
        r = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": horizon, "window": window, "simulated": True},
        )
    assert r.status_code == 200
    body = r.json()
    model = ModelMonitoringResponse.model_validate(body)
    assert model.mode == "simulated"
    assert model.source == SIMULATED_SOURCE
    assert model.model_version == SIMULATED_MODEL_VERSION
    assert model.disclaimer == SIMULATED_MONITORING_DISCLAIMER
    assert model.horizon == horizon
    assert model.window == window
    if model.available:
        assert model.status in {"stable", "watch", "drift_detected"}
        assert model.latest_performance is not None
        assert model.observation_counts.rolling_scored == window
        assert model.feature_drift is not None
        assert len(model.feature_drift.ranked) >= 1
    else:
        assert model.reason in {
            "insufficient_observations",
            "simulated_workbook_missing",
            "insufficient_feature_history",
        }
    assert httpx_mock.get_requests() == []


def test_live_monitoring_does_not_use_workbook_when_artifacts_missing(httpx_mock):
    with _client() as client:
        live = client.get(
            "/api/v1/model/monitoring", params={"horizon": "1d", "window": 30}
        )
        sim = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": "1d", "window": 30, "simulated": True},
        )
    assert live.status_code == 200
    live_body = ModelMonitoringResponse.model_validate(live.json())
    assert live_body.available is False
    assert live_body.mode == "live"
    assert live_body.reason in {
        "walk_forward_artifact_missing",
        "market_history_missing",
    }

    sim_body = ModelMonitoringResponse.model_validate(sim.json())
    assert sim_body.mode == "simulated"
    assert sim_body.source == SIMULATED_SOURCE
    assert httpx_mock.get_requests() == []


# ---------------------------------------------------------------------------
# Replay Lab
# ---------------------------------------------------------------------------


def test_simulated_replay_session_and_result_separated(httpx_mock):
    with _client() as client:
        random_body = client.get(
            "/api/v1/replay/spy/random", params={"simulated": True}
        ).json()
        assert random_body["available"] is True
        selected = random_body["selected_date"]

        session = client.get(
            "/api/v1/replay/spy/session",
            params={"date": selected, "simulated": True},
        ).json()
        result = client.get(
            "/api/v1/replay/spy/result",
            params={"date": selected, "simulated": True},
        ).json()

    session_model = ReplaySessionResponse.model_validate(session)
    result_model = ReplayResultResponse.model_validate(result)
    assert session_model.available is True
    assert session_model.mode == "simulated"
    assert session_model.source == SIMULATED_SOURCE
    assert session_model.disclaimer == SIMULATED_REPLAY_DISCLAIMER
    assert session_model.methodology.prediction_source == "simulated_forecast_history"
    assert_session_has_no_leakage(session)
    assert "series" not in result
    assert "indicators" not in result
    assert result_model.mode == "simulated"
    assert result_model.source == SIMULATED_SOURCE
    assert result_model.one_day is not None
    assert result_model.five_day is not None
    assert "fictional" in result_model.disclaimer.lower()
    assert result_model.model_version == SIMULATED_MODEL_VERSION
    assert httpx_mock.get_requests() == []


def test_simulated_replay_unavailable_date_keeps_reveal_boundary(httpx_mock):
    with _client() as client:
        r = client.get(
            "/api/v1/replay/spy/session",
            params={"date": "2099-01-01", "simulated": True},
        )
    assert r.status_code == 200
    body = ReplaySessionResponse.model_validate(r.json())
    assert body.available is False
    assert body.mode == "unavailable"
    assert body.source == SIMULATED_SOURCE
    assert_session_has_no_leakage(r.json())
    assert httpx_mock.get_requests() == []


def test_live_replay_isolated_from_simulated_workbook(httpx_mock):
    clear_replay_file_caches()
    with _client() as client:
        live = client.get(
            "/api/v1/replay/spy/session", params={"date": "2025-06-02"}
        ).json()
        sim = client.get(
            "/api/v1/replay/spy/random", params={"simulated": True}
        ).json()
    assert live["available"] is False
    assert live["mode"] == "unavailable"
    assert live["source"] == "local_historical_csv"
    assert sim["available"] is True
    assert sim["mode"] == "simulated"
    assert sim["source"] == SIMULATED_SOURCE
    assert_session_has_no_leakage(sim)
    assert httpx_mock.get_requests() == []
