"""End-to-end tests for GET /api/v1/replay/spy/*.

Controlled synthetic artifacts only — no live network requests.
Organized around user-visible API behavior: pre-reveal session, reveal result,
random selection, structured validation errors, and schema conformance.
"""

from __future__ import annotations

import random
from datetime import date, timedelta

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.features import build_features
from app.ml.replay import LOOKBACK_SESSIONS, REPLAY_DISCLAIMER, REPLAY_EVALUATION_NOTE
from app.ml.schemas import ReplayResultResponse, ReplaySessionResponse
from app.services.replay_service import ReplayService, clear_replay_file_caches, get_replay_service
from app.services.session import is_trading_day
from tests.replay_fixtures import (
    assert_session_has_no_leakage,
    seed_replay_artifacts,
    synthetic_ohlcv,
    synthetic_walk_forward,
    walk_forward_matching_ohlcv,
)


def _client() -> TestClient:
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# Pre-reveal session
# ---------------------------------------------------------------------------


def test_session_endpoint_returns_pre_reveal_context(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/session", params={"date": selected})

    assert r.status_code == 200
    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is True
    assert body["symbol"] == "SPY"
    assert body["selected_date"] == selected
    assert body["min_eligible_date"]
    assert body["max_eligible_date"]
    assert body["session_count"] == LOOKBACK_SESSIONS
    assert len(body["series"]) == LOOKBACK_SESSIONS
    assert body["series"][-1]["date"] == selected
    assert all(bar["date"] <= selected for bar in body["series"])
    assert body["indicators"]["close"] == pytest.approx(body["series"][-1]["close"])
    assert body["indicators"]["rsi_14"] is not None
    assert body["indicators"]["momentum_5d"] is not None
    assert body["horizons"] == [1, 5]
    assert body["mode"] == "historical"
    assert body["source"] == "local_historical_csv"
    assert "walk-forward" in body["methodology"]["summary"].lower()
    assert body["disclaimer"] == REPLAY_DISCLAIMER
    assert_session_has_no_leakage(body)


def test_session_chart_ends_exactly_on_selected_date(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[100].date().isoformat()

    with _client() as client:
        body = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    assert body["available"] is True
    dates = [bar["date"] for bar in body["series"]]
    assert dates[-1] == selected
    assert max(dates) == selected
    assert not any(d > selected for d in dates)


def test_session_never_contains_model_probabilities_or_future_outcomes(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[95].date().isoformat()

    with _client() as client:
        body = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    ReplaySessionResponse.model_validate(body)
    assert_session_has_no_leakage(body)
    # Nested chart points stay OHLCV-only.
    for bar in body["series"]:
        assert set(bar.keys()) == {"date", "open", "high", "low", "close", "volume"}


def test_session_indicators_match_as_of_selected_date_only(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected_ts = ohlcv["date"].iloc[100]
    selected = selected_ts.date().isoformat()

    with _client() as client:
        body = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    as_of = ohlcv[ohlcv["date"] <= selected_ts]
    features = build_features(as_of).iloc[-1]
    indicators = body["indicators"]
    assert indicators["close"] == pytest.approx(float(as_of["close"].iloc[-1]))
    assert indicators["momentum_5d"] == pytest.approx(float(features["return_5d"]))
    assert indicators["rsi_14"] == pytest.approx(float(features["rsi_14"]))
    assert indicators["rolling_vol_20"] == pytest.approx(float(features["rolling_vol_20"]))
    assert indicators["distance_from_sma_20"] == pytest.approx(
        float(features["distance_from_sma_20"])
    )
    assert indicators["opening_gap_pct"] == pytest.approx(float(features["opening_gap_pct"]))
    assert indicators["relative_volume"] == pytest.approx(
        float(features["volume_to_20d_avg"]) + 1.0
    )


def test_session_leakage_regression_future_row_mutation(tmp_path, monkeypatch):
    """Mutating OHLCV rows after the selected date must not change the session snapshot."""
    ohlcv = synthetic_ohlcv(n=140, seed=17)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=ohlcv, walk=walk)
    selected = ohlcv["date"].iloc[95].date().isoformat()

    with _client() as client:
        before = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    poisoned = ohlcv.copy()
    mask = poisoned["date"] > pd.Timestamp(selected)
    poisoned.loc[mask, "close"] = poisoned.loc[mask, "close"] * 5.0
    poisoned.loc[mask, "volume"] = poisoned.loc[mask, "volume"] + 99_000_000
    seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=poisoned, walk=walk)

    with _client() as client:
        after = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    assert before["available"] and after["available"]
    assert before["series"] == after["series"]
    assert before["indicators"] == after["indicators"]
    assert_session_has_no_leakage(after)


# ---------------------------------------------------------------------------
# Random selection
# ---------------------------------------------------------------------------


def test_random_endpoint_always_selects_eligible_date(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    listing = ReplayService().list_eligible_sessions()
    eligible = set(listing["eligible_dates"])
    assert len(eligible) >= 5

    rng = random.Random(7)
    app = create_app()
    app.dependency_overrides[get_replay_service] = lambda: ReplayService(rng=rng)
    try:
        with TestClient(app) as client:
            seen: set[str] = set()
            for _ in range(20):
                body = client.get("/api/v1/replay/spy/random").json()
                ReplaySessionResponse.model_validate(body)
                assert body["available"] is True
                assert body["selected_date"] in eligible
                assert body["min_eligible_date"] <= body["selected_date"] <= body["max_eligible_date"]
                assert_session_has_no_leakage(body)
                seen.add(body["selected_date"])
            assert len(seen) >= 2
    finally:
        app.dependency_overrides.clear()

    history = {pd.Timestamp(ts).date().isoformat() for ts in ohlcv["date"]}
    assert eligible <= history


# ---------------------------------------------------------------------------
# Reveal result
# ---------------------------------------------------------------------------


def test_result_endpoint_returns_walk_forward_outcomes(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=140, seed=5)
    walk = walk_forward_matching_ohlcv(ohlcv, ohlcv["date"].iloc[55:])
    seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=ohlcv, walk=walk)
    selected_idx = 90
    selected = ohlcv["date"].iloc[selected_idx].date().isoformat()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/result", params={"date": selected})

    assert r.status_code == 200
    body = r.json()
    ReplayResultResponse.model_validate(body)
    assert body["available"] is True
    assert body["selected_date"] == selected

    close_t = float(ohlcv["close"].iloc[selected_idx])
    expected_1d = (float(ohlcv["close"].iloc[selected_idx + 1]) / close_t) - 1.0
    expected_5d = (float(ohlcv["close"].iloc[selected_idx + 5]) / close_t) - 1.0
    assert body["one_day"]["realized_return"] == pytest.approx(expected_1d)
    assert body["five_day"]["realized_return"] == pytest.approx(expected_5d)

    wf_1d = walk[(walk["date"] == selected) & (walk["horizon_days"] == 1)].iloc[0]
    wf_5d = walk[(walk["date"] == selected) & (walk["horizon_days"] == 5)].iloc[0]
    assert body["one_day"]["prob_up"] == pytest.approx(float(wf_1d["prob_up"]))
    assert body["five_day"]["prob_up"] == pytest.approx(float(wf_5d["prob_up"]))
    assert body["one_day"]["direction_predicted"] == (
        "up" if int(wf_1d["predicted"]) == 1 else "down"
    )
    assert body["five_day"]["direction_actual"] == (
        "up" if int(wf_5d["actual"]) == 1 else "down"
    )
    assert body["source"] == "walk_forward_predictions"
    assert body["evaluation_note"] == REPLAY_EVALUATION_NOTE
    assert body["disclaimer"] == REPLAY_DISCLAIMER
    assert body["model_version"] == "v-test-replay"
    assert body["model_metadata"]["model_name_1d"] == "logistic_regression"
    assert "out-of-sample walk-forward" in body["evaluation_note"].lower()


def test_result_endpoint_does_not_call_load_model(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    import app.ml.artifacts as artifacts_module

    def _boom(*_args, **_kwargs):
        raise AssertionError("replay result must not load trained models")

    monkeypatch.setattr(artifacts_module, "load_model", _boom)

    with _client() as client:
        session = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()
        result = client.get("/api/v1/replay/spy/result", params={"date": selected}).json()
        random_body = client.get("/api/v1/replay/spy/random").json()

    assert session["available"] is True
    assert result["available"] is True
    assert random_body["available"] is True


def test_session_and_result_are_separated(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[100].date().isoformat()

    with _client() as client:
        session = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()
        result = client.get("/api/v1/replay/spy/result", params={"date": selected}).json()

    ReplaySessionResponse.model_validate(session)
    ReplayResultResponse.model_validate(result)
    assert_session_has_no_leakage(session)
    assert result["one_day"]["prob_up"] is not None
    assert "series" not in result
    assert "indicators" not in result


# ---------------------------------------------------------------------------
# Structured validation errors + nearest neighbors
# ---------------------------------------------------------------------------


def test_weekend_returns_structured_error_with_neighbors(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    mid = ohlcv["date"].iloc[80].date()
    candidate = mid
    while candidate.weekday() != 5:
        candidate = candidate + timedelta(days=1)
    saturday = candidate.isoformat()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/session", params={"date": saturday})

    assert r.status_code == 200
    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "weekend"
    assert "weekend" in body["detail"].lower()
    assert body["nearest_eligible_before"] is not None or body["nearest_eligible_after"] is not None
    assert body["series"] == []
    assert_session_has_no_leakage(body)


def test_market_holiday_returns_structured_error(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    holiday = "2020-12-25"
    assert not is_trading_day(date.fromisoformat(holiday))
    history_isos = {pd.Timestamp(ts).date().isoformat() for ts in ohlcv["date"]}
    assert holiday not in history_isos

    with _client() as client:
        r = client.get("/api/v1/replay/spy/result", params={"date": holiday})

    assert r.status_code == 200
    body = r.json()
    ReplayResultResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "market_holiday"
    assert "holiday" in body["detail"].lower()
    assert body["one_day"] is None
    assert body["five_day"] is None
    assert body["nearest_eligible_before"] is not None or body["nearest_eligible_after"] is not None


def test_date_out_of_range_includes_neighbors(tmp_path, monkeypatch):
    _ = seed_replay_artifacts(tmp_path, monkeypatch)
    far_future = "2030-01-02"

    with _client() as client:
        r = client.get("/api/v1/replay/spy/session", params={"date": far_future})

    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] in {"date_out_of_range", "not_a_trading_session"}
    assert body["nearest_eligible_before"] is not None
    assert body["nearest_eligible_after"] is None
    assert body["min_eligible_date"] is not None
    assert body["max_eligible_date"] is not None


def test_unsupported_date_includes_nearby_eligible_dates(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    from app import config as config_module

    target = ohlcv["date"].iloc[100].date().isoformat()
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    walk = walk[walk["date"] != target]
    artifacts = config_module.ARTIFACTS_DIR
    walk.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    clear_replay_file_caches()

    with _client() as client:
        body = client.get("/api/v1/replay/spy/session", params={"date": target}).json()

    assert body["available"] is False
    assert body["reason"] in {
        "walk_forward_prediction_unavailable",
        "outcome_unavailable",
        "date_not_eligible",
    }
    assert body["nearest_eligible_before"] is not None
    assert body["nearest_eligible_after"] is not None
    assert body["nearest_eligible_before"] < target < body["nearest_eligible_after"]


def test_insufficient_history_date(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    early = ohlcv["date"].iloc[10].date().isoformat()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/session", params={"date": early})

    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] in {
        "insufficient_history",
        "walk_forward_prediction_unavailable",
        "date_out_of_range",
    }
    assert body["nearest_eligible_after"] is not None


def test_missing_walk_forward_prediction(tmp_path, monkeypatch):
    from app import config as config_module

    ohlcv = synthetic_ohlcv(n=140)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:90])
    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    walk.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    later = ohlcv["date"].iloc[120].date().isoformat()
    with _client() as client:
        r = client.get("/api/v1/replay/spy/session", params={"date": later})

    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] in {
        "walk_forward_prediction_unavailable",
        "date_out_of_range",
    }


def test_missing_future_outcome(tmp_path, monkeypatch):
    from app import config as config_module

    ohlcv = synthetic_ohlcv(n=140)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    target = ohlcv["date"].iloc[100].date().isoformat()
    walk = walk[~((walk["date"] == target) & (walk["horizon_days"] == 5))]

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    walk.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/result", params={"date": target})

    body = r.json()
    ReplayResultResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "outcome_unavailable"
    assert body["one_day"] is None
    assert body["five_day"] is None
    assert body["nearest_eligible_before"] is not None or body["nearest_eligible_after"] is not None


def test_missing_history_artifact(tmp_path, monkeypatch):
    from app import config as config_module

    monkeypatch.setattr(config_module, "DATA_RAW_DIR", tmp_path / "missing")
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    with _client() as client:
        r = client.get("/api/v1/replay/spy/random")

    assert r.status_code == 200
    body = r.json()
    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "historical_dataset_missing"
    assert body["series"] == []


def test_malformed_walk_forward_artifact_is_truthful(tmp_path, monkeypatch):
    from app import config as config_module

    ohlcv = synthetic_ohlcv(n=100)
    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    pd.DataFrame({"date": ["2020-06-01"], "prob_up": [0.5]}).to_csv(
        artifacts / "walk_forward_predictions.csv", index=False
    )
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    with _client() as client:
        session = client.get(
            "/api/v1/replay/spy/session",
            params={"date": ohlcv["date"].iloc[80].date().isoformat()},
        ).json()
        result = client.get(
            "/api/v1/replay/spy/result",
            params={"date": ohlcv["date"].iloc[80].date().isoformat()},
        ).json()

    ReplaySessionResponse.model_validate(session)
    ReplayResultResponse.model_validate(result)
    assert session["available"] is False
    assert result["available"] is False
    assert result["one_day"] is None
    assert result["five_day"] is None
    assert session["reason"] == "walk_forward_artifact_malformed"
    assert result["reason"] == "walk_forward_artifact_malformed"


def test_malformed_history_artifact_is_truthful(tmp_path, monkeypatch):
    from app import config as config_module

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    (data_raw / "spy_daily.csv").write_text("garbage,csv\n1,2\n")
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    synthetic_walk_forward(pd.bdate_range("2020-06-01", periods=10)).to_csv(
        artifacts / "walk_forward_predictions.csv", index=False
    )
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    with _client() as client:
        body = client.get(
            "/api/v1/replay/spy/session",
            params={"date": "2020-06-15"},
        ).json()

    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "historical_dataset_malformed"
    assert body["series"] == []


@pytest.mark.parametrize("path", ["/api/v1/replay/spy/session", "/api/v1/replay/spy/result"])
def test_missing_date_query_returns_422(path, tmp_path, monkeypatch):
    seed_replay_artifacts(tmp_path, monkeypatch)
    with _client() as client:
        r = client.get(path)
    assert r.status_code == 422


def test_invalid_date_format_returns_structured_unavailable(tmp_path, monkeypatch):
    seed_replay_artifacts(tmp_path, monkeypatch)

    with _client() as client:
        body = client.get(
            "/api/v1/replay/spy/session",
            params={"date": "not-a-date"},
        ).json()

    ReplaySessionResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] == "invalid_date"
    assert body["series"] == []


# ---------------------------------------------------------------------------
# Caching + isolation + no live network
# ---------------------------------------------------------------------------


def test_repeated_api_requests_reuse_cached_file_loads(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    import app.services.replay_service as replay_module

    real_read_csv = pd.read_csv
    calls = {"n": 0}

    def counting_read_csv(*args, **kwargs):
        calls["n"] += 1
        return real_read_csv(*args, **kwargs)

    monkeypatch.setattr(replay_module.pd, "read_csv", counting_read_csv)

    with _client() as client:
        assert client.get("/api/v1/replay/spy/session", params={"date": selected}).status_code == 200
        assert client.get("/api/v1/replay/spy/result", params={"date": selected}).status_code == 200
        assert client.get("/api/v1/replay/spy/random").status_code == 200

    assert calls["n"] == 2


def test_api_cache_reset_allows_fresh_reads(tmp_path, monkeypatch):
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    import app.services.replay_service as replay_module

    real_read_csv = pd.read_csv
    calls = {"n": 0}

    def counting_read_csv(*args, **kwargs):
        calls["n"] += 1
        return real_read_csv(*args, **kwargs)

    monkeypatch.setattr(replay_module.pd, "read_csv", counting_read_csv)

    with _client() as client:
        client.get("/api/v1/replay/spy/session", params={"date": selected})
    assert calls["n"] == 2

    clear_replay_file_caches()
    with _client() as client:
        client.get("/api/v1/replay/spy/session", params={"date": selected})
    assert calls["n"] == 4


def test_no_alpha_vantage_calls(tmp_path, monkeypatch, httpx_mock):
    """Replay must not issue upstream HTTP requests."""
    ohlcv = seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    with _client() as client:
        assert client.get("/api/v1/replay/spy/session", params={"date": selected}).status_code == 200
        assert client.get("/api/v1/replay/spy/random").status_code == 200
        assert client.get("/api/v1/replay/spy/result", params={"date": selected}).status_code == 200

    assert httpx_mock.get_requests() == []
