"""End-to-end tests for GET /api/v1/replay/spy/*.

Controlled synthetic artifacts only — no live network requests.
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.replay import LOOKBACK_SESSIONS, REPLAY_DISCLAIMER, REPLAY_EVALUATION_NOTE
from app.ml.schemas import ReplayResultResponse, ReplaySessionResponse
from app.ml.targets import add_targets
from app.services.replay_service import ReplayService, clear_replay_file_caches, get_replay_service
from app.services.session import is_trading_day


def _ohlcv(n: int = 200, start: str = "2020-01-02", seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = 300 + np.cumsum(rng.normal(0, 1.2, size=n))
    dates = pd.bdate_range(start=start, periods=n)
    return pd.DataFrame(
        {
            "date": dates,
            "open": close + rng.normal(0, 0.4, size=n),
            "high": close + rng.uniform(0.3, 1.8, size=n),
            "low": close - rng.uniform(0.3, 1.8, size=n),
            "close": close,
            "volume": rng.integers(1_000_000, 8_000_000, size=n),
        }
    )


def _walk_forward_for(dates, *, realized_by_date: dict | None = None) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    realized_by_date = realized_by_date or {}
    for i, ts in enumerate(dates):
        iso = pd.Timestamp(ts).date().isoformat()
        for h in (1, 5):
            realized = realized_by_date.get(iso, {}).get(h)
            if realized is None:
                realized = 0.01 if i % 2 == 0 else -0.01
            rows.append(
                {
                    "date": iso,
                    "horizon_days": h,
                    "prob_up": 0.4 + (i % 10) * 0.02,
                    "predicted": int((0.4 + (i % 10) * 0.02) >= 0.5),
                    "actual": int(realized > 0),
                    "correct": int(((0.4 + (i % 10) * 0.02) >= 0.5) == (realized > 0)),
                    "realized_return": float(realized),
                }
            )
    return pd.DataFrame(rows)


def _walk_forward_from_ohlcv(ohlcv: pd.DataFrame, dates) -> pd.DataFrame:
    with_targets = add_targets(ohlcv.copy())
    by_date = {
        pd.Timestamp(row["date"]).normalize(): row for _, row in with_targets.iterrows()
    }
    realized: dict[str, dict[int, float]] = {}
    for ts in dates:
        row = by_date[pd.Timestamp(ts).normalize()]
        iso = pd.Timestamp(ts).date().isoformat()
        realized[iso] = {
            1: float(row["realized_future_return_1d"]),
            5: float(row["realized_future_return_5d"]),
        }
    return _walk_forward_for(dates, realized_by_date=realized)


def _seed_replay_artifacts(
    tmp_path,
    monkeypatch,
    *,
    n: int = 140,
    ohlcv: pd.DataFrame | None = None,
    walk: pd.DataFrame | None = None,
) -> pd.DataFrame:
    from app import config as config_module

    frame = ohlcv if ohlcv is not None else _ohlcv(n=n)
    walk_frame = (
        walk if walk is not None else _walk_forward_for(frame["date"].iloc[55:])
    )

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    frame.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    walk_frame.to_csv(artifacts / "walk_forward_predictions.csv", index=False)
    (artifacts / "model_version.txt").write_text("v-test-replay\n")
    (artifacts / "training_metadata.json").write_text(
        json.dumps(
            {
                "1d": {
                    "holdout_start": "2020-03-01",
                    "holdout_end": "2020-07-01",
                    "model_name": "logistic_regression",
                    "n_holdout": 80,
                },
                "5d": {
                    "holdout_start": "2020-03-01",
                    "holdout_end": "2020-07-01",
                    "model_name": "logistic_regression",
                    "n_holdout": 80,
                },
            }
        )
    )
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()
    return frame


def _client() -> TestClient:
    return TestClient(create_app())


def _assert_no_leakage(payload: dict) -> None:
    """Session payloads must not expose model outputs or future labels."""
    for forbidden in (
        "prob_up",
        "direction_predicted",
        "direction_actual",
        "realized_return",
        "one_day",
        "five_day",
        "predicted",
        "actual",
        "correct",
    ):
        assert forbidden not in payload
    for bar in payload.get("series", []):
        assert set(bar.keys()) <= {"date", "open", "high", "low", "close", "volume"}
    indicators = payload.get("indicators") or {}
    for forbidden in ("prob_up", "realized_return", "direction_predicted", "direction_actual"):
        assert forbidden not in indicators


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------


def test_session_endpoint_returns_pre_reveal_context(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
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
    _assert_no_leakage(body)


def test_session_chart_never_contains_rows_after_selected_date(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[100].date().isoformat()

    with _client() as client:
        body = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    assert body["available"] is True
    dates = [bar["date"] for bar in body["series"]]
    assert dates[-1] == selected
    assert max(dates) == selected
    assert not any(d > selected for d in dates)


def test_session_endpoint_regression_future_row_mutation(tmp_path, monkeypatch):
    """Mutating OHLCV rows after the selected date must not change the session snapshot."""
    ohlcv = _ohlcv(n=140, seed=17)
    walk = _walk_forward_for(ohlcv["date"].iloc[55:])
    _seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=ohlcv, walk=walk)
    selected = ohlcv["date"].iloc[95].date().isoformat()

    with _client() as client:
        before = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    poisoned = ohlcv.copy()
    mask = poisoned["date"] > pd.Timestamp(selected)
    poisoned.loc[mask, "close"] = poisoned.loc[mask, "close"] * 5.0
    poisoned.loc[mask, "volume"] = poisoned.loc[mask, "volume"] + 99_000_000
    _seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=poisoned, walk=walk)

    with _client() as client:
        after = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()

    assert before["available"] and after["available"]
    assert before["series"] == after["series"]
    assert before["indicators"] == after["indicators"]
    _assert_no_leakage(after)


def test_random_endpoint_always_selects_eligible_date(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    listing = ReplayService().list_eligible_sessions()
    eligible = set(listing["eligible_dates"])
    assert len(eligible) >= 5

    # One shared RNG instance so successive /random draws advance the stream.
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
                _assert_no_leakage(body)
                seen.add(body["selected_date"])
            assert len(seen) >= 2
    finally:
        app.dependency_overrides.clear()

    history = {pd.Timestamp(ts).date().isoformat() for ts in ohlcv["date"]}
    assert eligible <= history


def test_result_endpoint_returns_walk_forward_outcomes(tmp_path, monkeypatch):
    ohlcv = _ohlcv(n=140, seed=5)
    walk = _walk_forward_from_ohlcv(ohlcv, ohlcv["date"].iloc[55:])
    _seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=ohlcv, walk=walk)
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
    assert body["one_day"]["prob_up"] == pytest.approx(float(wf_1d["prob_up"]))
    assert body["source"] == "walk_forward_predictions"
    assert body["evaluation_note"] == REPLAY_EVALUATION_NOTE
    assert body["disclaimer"] == REPLAY_DISCLAIMER
    assert body["model_version"] == "v-test-replay"
    assert body["model_metadata"]["model_name_1d"] == "logistic_regression"


def test_result_endpoint_does_not_call_load_model(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
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
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[100].date().isoformat()

    with _client() as client:
        session = client.get("/api/v1/replay/spy/session", params={"date": selected}).json()
        result = client.get("/api/v1/replay/spy/result", params={"date": selected}).json()

    ReplaySessionResponse.model_validate(session)
    ReplayResultResponse.model_validate(result)
    _assert_no_leakage(session)
    assert result["one_day"]["prob_up"] is not None
    assert "series" not in result


# ---------------------------------------------------------------------------
# Validation / structured errors
# ---------------------------------------------------------------------------


def test_weekend_returns_structured_error_with_neighbors(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
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
    assert body["nearest_eligible_before"] is not None or body["nearest_eligible_after"] is not None
    assert body["series"] == []
    _assert_no_leakage(body)


def test_market_holiday_returns_structured_error(tmp_path, monkeypatch):
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    # Choose a holiday that is not present as a bar in the synthetic history so
    # the calendar check (not the eligible-set short-circuit) applies.
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
    assert body["one_day"] is None
    assert body["five_day"] is None
    assert body["nearest_eligible_before"] is not None or body["nearest_eligible_after"] is not None


def test_date_out_of_range_includes_neighbors(tmp_path, monkeypatch):
    _seed_replay_artifacts(tmp_path, monkeypatch)
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
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    # Gap inside the eligible window: drop one date from walk-forward.
    from app import config as config_module

    target = ohlcv["date"].iloc[100].date().isoformat()
    walk = _walk_forward_for(ohlcv["date"].iloc[55:])
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
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
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

    ohlcv = _ohlcv(n=140)
    walk = _walk_forward_for(ohlcv["date"].iloc[60:90])
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
    assert body["available"] is False
    assert body["reason"] in {
        "walk_forward_prediction_unavailable",
        "date_out_of_range",
    }


def test_missing_future_outcome(tmp_path, monkeypatch):
    from app import config as config_module

    ohlcv = _ohlcv(n=140)
    walk = _walk_forward_for(ohlcv["date"].iloc[60:])
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


def test_malformed_walk_forward_artifact_is_truthful(tmp_path, monkeypatch):
    from app import config as config_module

    ohlcv = _ohlcv(n=100)
    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    # Missing required columns.
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


@pytest.mark.parametrize("path", ["/api/v1/replay/spy/session", "/api/v1/replay/spy/result"])
def test_missing_date_query_returns_422(path, tmp_path, monkeypatch):
    _seed_replay_artifacts(tmp_path, monkeypatch)
    with _client() as client:
        r = client.get(path)
    assert r.status_code == 422


def test_no_alpha_vantage_calls(tmp_path, monkeypatch, httpx_mock):
    """Replay must not issue upstream HTTP requests."""
    ohlcv = _seed_replay_artifacts(tmp_path, monkeypatch)
    selected = ohlcv["date"].iloc[90].date().isoformat()

    with _client() as client:
        assert client.get("/api/v1/replay/spy/session", params={"date": selected}).status_code == 200
        assert client.get("/api/v1/replay/spy/random").status_code == 200
        assert client.get("/api/v1/replay/spy/result", params={"date": selected}).status_code == 200

    assert httpx_mock.get_requests() == []
