"""Tests for Market Replay Lab domain helpers and service.

Uses controlled synthetic OHLCV + walk-forward frames only — no network.
Organized around user-visible replay behavior: eligibility, pre-reveal
integrity, walk-forward outcomes, truthful unavailable states, and caching.
"""

from __future__ import annotations

import random
import time

import numpy as np
import pandas as pd
import pytest

from app.ml.features import FEATURE_NAMES, build_features
from app.ml.replay import (
    LOOKBACK_SESSIONS,
    MIN_FEATURE_HISTORY,
    assert_snapshot_has_no_leakage_fields,
    build_replay_bundle,
    build_replay_result,
    build_replay_snapshot,
    eligible_replay_dates,
    nearest_eligible_dates,
    walk_forward_outcome_dates,
)
from app.ml.schemas import ReplayResponse, ReplaySnapshotSchema
from app.ml.targets import add_targets
from app.services.replay_service import (
    ReplayService,
    clear_replay_file_caches,
)
from tests.replay_fixtures import (
    assert_session_has_no_leakage,
    seed_replay_artifacts,
    synthetic_ohlcv,
    synthetic_walk_forward,
    walk_forward_matching_ohlcv,
    write_history,
    write_walk_forward,
)

# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------


def test_eligible_dates_are_intersection_of_history_and_walk_forward():
    ohlcv = synthetic_ohlcv(n=120)
    walk_dates = ohlcv["date"].iloc[70:100]
    walk = synthetic_walk_forward(walk_dates)

    eligible = eligible_replay_dates(ohlcv, walk)
    eligible_set = set(eligible)
    history_isos = {pd.Timestamp(ts).date().isoformat() for ts in ohlcv["date"]}
    walk_isos = {pd.Timestamp(ts).date().isoformat() for ts in walk_dates}

    assert eligible
    assert eligible_set <= history_isos
    assert eligible_set <= walk_isos
    assert eligible[0] == ohlcv["date"].iloc[70].date().isoformat()
    assert eligible[-1] == ohlcv["date"].iloc[99].date().isoformat()
    # History-only date with no walk-forward row is excluded.
    assert ohlcv["date"].iloc[110].date().isoformat() not in eligible_set


def test_dates_without_sufficient_lookback_are_excluded():
    ohlcv = synthetic_ohlcv(n=120)
    outcome_dates = ohlcv["date"].iloc[50:]
    walk = synthetic_walk_forward(outcome_dates)

    eligible = eligible_replay_dates(ohlcv, walk)
    assert eligible
    # Index 50 has outcomes but fewer than LOOKBACK_SESSIONS prior bars.
    assert ohlcv["date"].iloc[50].date().isoformat() not in set(eligible)
    # First eligible session is the first with sessions_through >= 60.
    assert eligible[0] == ohlcv["date"].iloc[59].date().isoformat()
    assert eligible[-1] == ohlcv["date"].iloc[-1].date().isoformat()


def test_dates_missing_one_horizon_are_not_eligible():
    ohlcv = synthetic_ohlcv(n=100)
    walk = synthetic_walk_forward(
        ohlcv["date"].iloc[60:],
        drop_horizon_on={ohlcv["date"].iloc[80].date().isoformat(): 5},
    )
    eligible = set(eligible_replay_dates(ohlcv, walk))
    assert ohlcv["date"].iloc[80].date().isoformat() not in eligible
    assert ohlcv["date"].iloc[81].date().isoformat() in eligible


def test_dates_without_known_outcomes_are_excluded():
    ohlcv = synthetic_ohlcv(n=100)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    target = ohlcv["date"].iloc[85].date().isoformat()
    walk.loc[walk["date"] == target, "realized_return"] = np.nan
    walk.loc[walk["date"] == target, "actual"] = np.nan

    eligible = set(eligible_replay_dates(ohlcv, walk))
    assert target not in eligible
    assert ohlcv["date"].iloc[86].date().isoformat() in eligible


def test_walk_forward_outcome_dates_require_finite_realized_return():
    walk = synthetic_walk_forward(pd.bdate_range("2023-01-03", periods=3))
    walk.loc[walk["date"] == "2023-01-03", "realized_return"] = np.nan
    dates = {ts.date().isoformat() for ts in walk_forward_outcome_dates(walk)}
    assert "2023-01-03" not in dates
    assert "2023-01-04" in dates


def test_nearest_eligible_dates_before_and_after():
    eligible = ["2024-01-02", "2024-01-03", "2024-01-05", "2024-01-08"]
    before, after = nearest_eligible_dates(eligible, "2024-01-04")
    assert before == "2024-01-03"
    assert after == "2024-01-05"
    before, after = nearest_eligible_dates(eligible, "2024-01-01")
    assert before is None
    assert after == "2024-01-02"
    before, after = nearest_eligible_dates(eligible, "2024-01-10")
    assert before == "2024-01-08"
    assert after is None
    before, after = nearest_eligible_dates(eligible, "2024-01-05")
    assert before == "2024-01-03"
    assert after == "2024-01-08"


# ---------------------------------------------------------------------------
# Pre-reveal snapshot integrity (no look-ahead)
# ---------------------------------------------------------------------------


def test_snapshot_chart_ends_exactly_on_selected_date():
    ohlcv = synthetic_ohlcv(n=120)
    selected = ohlcv["date"].iloc[90]
    snapshot = build_replay_snapshot(ohlcv, selected, lookback_sessions=LOOKBACK_SESSIONS)

    assert len(snapshot.sessions) == LOOKBACK_SESSIONS
    assert snapshot.sessions[-1].date == selected.date().isoformat()
    assert all(bar.date <= snapshot.selected_date for bar in snapshot.sessions)
    assert max(bar.date for bar in snapshot.sessions) == snapshot.selected_date


def test_snapshot_never_includes_future_or_model_fields():
    ohlcv = synthetic_ohlcv(n=120)
    selected = ohlcv["date"].iloc[90]
    future = synthetic_ohlcv(n=10, start="2025-01-01", seed=99)
    future["close"] = future["close"] + 500
    combined = pd.concat([ohlcv, future], ignore_index=True)

    snapshot = build_replay_snapshot(combined, selected, lookback_sessions=LOOKBACK_SESSIONS)
    assert_snapshot_has_no_leakage_fields(snapshot)
    assert snapshot.selected_date == selected.date().isoformat()
    assert len(snapshot.sessions) == LOOKBACK_SESSIONS
    assert all(bar.date <= snapshot.selected_date for bar in snapshot.sessions)

    snapshot_as_of = build_replay_snapshot(ohlcv, selected, lookback_sessions=LOOKBACK_SESSIONS)
    assert [b.close for b in snapshot.sessions] == [b.close for b in snapshot_as_of.sessions]
    assert [b.rsi_14 for b in snapshot.sessions] == [b.rsi_14 for b in snapshot_as_of.sessions]


def test_modifying_rows_after_selected_date_does_not_change_snapshot():
    """Leakage regression: post-selected mutations must not alter the pre-reveal snapshot."""
    ohlcv = synthetic_ohlcv(n=130, seed=21)
    selected = ohlcv["date"].iloc[95]
    baseline = build_replay_snapshot(ohlcv, selected, lookback_sessions=LOOKBACK_SESSIONS)

    poisoned = ohlcv.copy()
    mask = poisoned["date"] > selected
    poisoned.loc[mask, "close"] = poisoned.loc[mask, "close"] * 10.0
    poisoned.loc[mask, "volume"] = poisoned.loc[mask, "volume"] + 50_000_000
    poisoned.loc[mask, "high"] = poisoned.loc[mask, "high"] + 100.0

    after = build_replay_snapshot(poisoned, selected, lookback_sessions=LOOKBACK_SESSIONS)
    assert baseline.to_dict() == after.to_dict()


def test_indicators_use_only_information_through_selected_date():
    ohlcv = synthetic_ohlcv(n=100)
    selected = ohlcv["date"].iloc[-1]
    snapshot = build_replay_snapshot(ohlcv, selected, lookback_sessions=LOOKBACK_SESSIONS)

    as_of = ohlcv[ohlcv["date"] <= selected]
    features = build_features(as_of).iloc[-1]
    selected_bar = snapshot.sessions[-1]

    assert selected_bar.momentum_5d == pytest.approx(float(features["return_5d"]))
    assert selected_bar.rsi_14 == pytest.approx(float(features["rsi_14"]))
    assert selected_bar.rolling_vol_20 == pytest.approx(float(features["rolling_vol_20"]))
    assert selected_bar.distance_from_sma_20 == pytest.approx(
        float(features["distance_from_sma_20"])
    )
    assert selected_bar.opening_gap_pct == pytest.approx(float(features["opening_gap_pct"]))
    assert selected_bar.relative_volume == pytest.approx(
        float(features["volume_to_20d_avg"]) + 1.0
    )
    assert features[list(FEATURE_NAMES)].notna().all()


def test_snapshot_rejects_insufficient_lookback():
    ohlcv = synthetic_ohlcv(n=40)
    with pytest.raises(ValueError, match="Need at least"):
        build_replay_snapshot(ohlcv, ohlcv["date"].iloc[-1], lookback_sessions=60)


# ---------------------------------------------------------------------------
# Walk-forward outcomes (no retrospective model inference)
# ---------------------------------------------------------------------------


def test_result_reads_walk_forward_not_model_inference():
    ohlcv = synthetic_ohlcv(n=100)
    selected = ohlcv["date"].iloc[80]
    walk = synthetic_walk_forward([selected])
    ohlcv = ohlcv.copy()
    # Poison future prices — result must still come from the walk-forward artifact.
    ohlcv.loc[ohlcv["date"] > selected, "close"] = 1e9

    result = build_replay_result(walk, selected)
    assert result.source == "walk_forward_predictions"
    assert result.one_day.horizon_days == 1
    assert result.five_day.horizon_days == 5
    assert result.one_day.prob_up == pytest.approx(float(walk.iloc[0]["prob_up"]))
    assert result.five_day.realized_return == pytest.approx(
        float(walk.loc[walk["horizon_days"] == 5, "realized_return"].iloc[0])
    )


def test_one_and_five_session_returns_match_future_trading_sessions():
    """Realized returns must equal next / fifth future trading-session closes."""
    ohlcv = synthetic_ohlcv(n=120, seed=3)
    selected_idx = 90
    selected = ohlcv["date"].iloc[selected_idx]
    assert selected_idx + 5 < len(ohlcv)

    close_t = float(ohlcv["close"].iloc[selected_idx])
    close_next = float(ohlcv["close"].iloc[selected_idx + 1])
    close_fifth = float(ohlcv["close"].iloc[selected_idx + 5])
    expected_1d = (close_next / close_t) - 1.0
    expected_5d = (close_fifth / close_t) - 1.0

    targets = add_targets(ohlcv)
    row = targets.iloc[selected_idx]
    assert float(row["realized_future_return_1d"]) == pytest.approx(expected_1d)
    assert float(row["realized_future_return_5d"]) == pytest.approx(expected_5d)
    next_session = pd.Timestamp(ohlcv["date"].iloc[selected_idx + 1]).normalize()
    fifth_session = pd.Timestamp(ohlcv["date"].iloc[selected_idx + 5]).normalize()
    assert next_session > pd.Timestamp(selected).normalize()
    assert fifth_session > next_session

    walk = walk_forward_matching_ohlcv(ohlcv, [selected])
    result = build_replay_result(walk, selected)
    assert result.one_day.realized_return == pytest.approx(expected_1d)
    assert result.five_day.realized_return == pytest.approx(expected_5d)
    assert result.one_day.direction_actual == ("up" if expected_1d > 0 else "down")
    assert result.five_day.direction_actual == ("up" if expected_5d > 0 else "down")


def test_bundle_keeps_snapshot_and_result_separate():
    ohlcv = synthetic_ohlcv(n=120)
    selected = ohlcv["date"].iloc[90]
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    bundle = build_replay_bundle(ohlcv, walk, selected)

    snap_keys = set(bundle.snapshot.to_dict().keys())
    assert "result" not in snap_keys
    assert "one_day" not in snap_keys
    assert "prob_up" not in str(bundle.snapshot.to_dict())
    assert bundle.result.selected_date == bundle.snapshot.selected_date
    ReplaySnapshotSchema.model_validate(bundle.snapshot.to_dict())


# ---------------------------------------------------------------------------
# Service: truthful unavailable states
# ---------------------------------------------------------------------------


def test_service_unavailable_when_history_missing(tmp_path, monkeypatch):
    from app import config as config_module

    monkeypatch.setattr(config_module, "DATA_RAW_DIR", tmp_path / "missing_data")
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", tmp_path / "artifacts")
    (tmp_path / "artifacts").mkdir(exist_ok=True)
    clear_replay_file_caches()

    payload = ReplayService().list_eligible_sessions()
    assert payload["available"] is False
    assert payload["reason"] == "historical_dataset_missing"
    assert payload["eligible_dates"] == []


def test_service_unavailable_when_walk_forward_missing(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=80)
    write_history(tmp_path, ohlcv, monkeypatch)
    from app import config as config_module

    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", tmp_path / "empty_artifacts")
    (tmp_path / "empty_artifacts").mkdir()
    clear_replay_file_caches()

    payload = ReplayService().get_replay(ohlcv["date"].iloc[-1].date().isoformat())
    assert payload["available"] is False
    assert payload["reason"] == "walk_forward_artifact_missing"
    assert payload["snapshot"] is None
    assert payload["result"] is None


def test_service_malformed_walk_forward_does_not_fabricate(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=100)
    write_history(tmp_path, ohlcv, monkeypatch)
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    (artifacts / "walk_forward_predictions.csv").write_text("not,a,valid,artifact\n1,2,3\n")
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    service = ReplayService()
    listing = service.list_eligible_sessions()
    result = service.get_result(ohlcv["date"].iloc[80].date().isoformat())

    assert listing["available"] is False
    assert listing["reason"] == "walk_forward_artifact_malformed"
    assert result["available"] is False
    assert result["reason"] == "walk_forward_artifact_malformed"
    assert result["one_day"] is None
    assert result["five_day"] is None


def test_service_malformed_history_is_truthful(tmp_path, monkeypatch):
    from app import config as config_module

    data_raw = tmp_path / "data"
    data_raw.mkdir(exist_ok=True)
    (data_raw / "spy_daily.csv").write_text("not,valid,ohlcv\n1,2,3\n")
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    synthetic_walk_forward(pd.bdate_range("2023-01-03", periods=5)).to_csv(
        artifacts / "walk_forward_predictions.csv", index=False
    )
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    clear_replay_file_caches()

    payload = ReplayService().list_eligible_sessions()
    assert payload["available"] is False
    assert payload["reason"] == "historical_dataset_malformed"


def test_service_ineligible_date_is_truthful(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=100)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    early = ohlcv["date"].iloc[10].date().isoformat()
    payload = ReplayService().get_replay(early)
    assert payload["available"] is False
    assert payload["reason"] in {
        "date_not_eligible",
        "insufficient_history",
        "walk_forward_prediction_unavailable",
        "date_out_of_range",
    }
    assert payload["snapshot"] is None
    assert payload["result"] is None
    assert payload["nearest_eligible_after"] is not None


# ---------------------------------------------------------------------------
# Service: happy paths + model isolation
# ---------------------------------------------------------------------------


def test_service_returns_replay_bundle(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=120)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    service = ReplayService()
    listing = service.list_eligible_sessions()
    assert listing["available"] is True
    assert listing["eligible_count"] == len(listing["eligible_dates"])
    assert listing["lookback_sessions"] == LOOKBACK_SESSIONS
    assert listing["min_feature_history"] == MIN_FEATURE_HISTORY

    selected = listing["eligible_dates"][0]
    payload = service.get_replay(selected)
    assert payload["available"] is True
    assert payload["snapshot"] is not None
    assert payload["result"] is not None
    assert payload["snapshot"]["selected_date"] == selected
    assert payload["result"]["source"] == "walk_forward_predictions"
    assert "prob_up" not in payload["snapshot"]
    assert "one_day" not in payload["snapshot"]
    ReplayResponse.model_validate(payload)


def test_service_session_does_not_expose_model_outputs(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=120)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    listing = ReplayService().list_eligible_sessions()
    selected = listing["eligible_dates"][5]
    payload = ReplayService().get_session(selected)

    assert payload["available"] is True
    assert_session_has_no_leakage(payload)
    assert payload["series"][-1]["date"] == selected
    assert all(bar["date"] <= selected for bar in payload["series"])
    assert payload["indicators"]["close"] == pytest.approx(payload["series"][-1]["close"])


def test_service_result_uses_walk_forward_artifact_values(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=120, seed=11)
    selected = ohlcv["date"].iloc[95]
    walk = walk_forward_matching_ohlcv(ohlcv, ohlcv["date"].iloc[60:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    payload = ReplayService().get_result(selected.date().isoformat())
    assert payload["available"] is True
    wf_1d = walk[(walk["date"] == selected.date().isoformat()) & (walk["horizon_days"] == 1)].iloc[0]
    wf_5d = walk[(walk["date"] == selected.date().isoformat()) & (walk["horizon_days"] == 5)].iloc[0]
    assert payload["one_day"]["prob_up"] == pytest.approx(float(wf_1d["prob_up"]))
    assert payload["five_day"]["prob_up"] == pytest.approx(float(wf_5d["prob_up"]))
    assert payload["one_day"]["realized_return"] == pytest.approx(float(wf_1d["realized_return"]))
    assert payload["five_day"]["realized_return"] == pytest.approx(float(wf_5d["realized_return"]))
    assert payload["one_day"]["direction_predicted"] == (
        "up" if int(wf_1d["predicted"]) == 1 else "down"
    )
    assert payload["five_day"]["direction_actual"] == (
        "up" if int(wf_5d["actual"]) == 1 else "down"
    )
    assert payload["source"] == "walk_forward_predictions"


def test_service_never_calls_load_model(tmp_path, monkeypatch):
    """Replay must not load/run the final trained model for retrospective preds."""
    ohlcv = synthetic_ohlcv(n=120)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    import app.ml.artifacts as artifacts_module

    def _boom(*_args, **_kwargs):
        raise AssertionError("load_model must not be called by Market Replay")

    monkeypatch.setattr(artifacts_module, "load_model", _boom)

    service = ReplayService(rng=random.Random(0))
    listing = service.list_eligible_sessions()
    selected = listing["eligible_dates"][0]
    assert service.get_session(selected)["available"] is True
    assert service.get_result(selected)["available"] is True
    assert service.get_random_session()["available"] is True


def test_service_random_always_selects_eligible_date(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=120)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    service = ReplayService(rng=random.Random(42))
    listing = service.list_eligible_sessions()
    eligible = set(listing["eligible_dates"])
    assert len(eligible) >= 5

    seen: set[str] = set()
    for _ in range(25):
        payload = service.get_random_session()
        assert payload["available"] is True
        assert payload["selected_date"] in eligible
        seen.add(payload["selected_date"])
    assert len(seen) >= 2


# ---------------------------------------------------------------------------
# Caching + isolation
# ---------------------------------------------------------------------------


def test_service_caches_csv_loads_across_repeated_requests(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=100)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    import app.services.replay_service as replay_module

    real_read_csv = pd.read_csv
    calls = {"n": 0}

    def counting_read_csv(*args, **kwargs):
        calls["n"] += 1
        return real_read_csv(*args, **kwargs)

    monkeypatch.setattr(replay_module.pd, "read_csv", counting_read_csv)

    service = ReplayService()
    first = service.list_eligible_sessions()
    second = service.get_session(first["eligible_dates"][0])
    third = service.get_result(first["eligible_dates"][0])
    assert first["available"] is True
    assert second["available"] is True
    assert third["available"] is True
    # History + walk-forward parsed once each, then reused.
    assert calls["n"] == 2


def test_clear_replay_file_caches_forces_reload(tmp_path, monkeypatch):
    ohlcv = synthetic_ohlcv(n=100)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[60:])
    write_history(tmp_path, ohlcv, monkeypatch)
    write_walk_forward(tmp_path, walk, monkeypatch)

    import app.services.replay_service as replay_module

    real_read_csv = pd.read_csv
    calls = {"n": 0}

    def counting_read_csv(*args, **kwargs):
        calls["n"] += 1
        return real_read_csv(*args, **kwargs)

    monkeypatch.setattr(replay_module.pd, "read_csv", counting_read_csv)

    service = ReplayService()
    service.list_eligible_sessions()
    assert calls["n"] == 2

    clear_replay_file_caches()
    service.list_eligible_sessions()
    assert calls["n"] == 4


def test_cache_invalidates_when_artifact_mtime_changes(tmp_path, monkeypatch):
    """Rewriting walk-forward on disk must refresh the cached frame."""
    ohlcv = synthetic_ohlcv(n=120)
    walk = synthetic_walk_forward(ohlcv["date"].iloc[55:])
    seed_replay_artifacts(tmp_path, monkeypatch, ohlcv=ohlcv, walk=walk)

    service = ReplayService()
    listing = service.list_eligible_sessions()
    selected = listing["eligible_dates"][0]
    before = service.get_result(selected)
    assert before["available"] is True
    original_prob = before["one_day"]["prob_up"]

    # Rewrite walk-forward with a different probability for the same date.
    from app import config as config_module

    updated = walk.copy()
    mask = (updated["date"] == selected) & (updated["horizon_days"] == 1)
    updated.loc[mask, "prob_up"] = 0.11
    # Ensure mtime advances on filesystems with coarse timestamps.
    time.sleep(0.02)
    updated.to_csv(config_module.ARTIFACTS_DIR / "walk_forward_predictions.csv", index=False)

    after = service.get_result(selected)
    assert after["available"] is True
    assert after["one_day"]["prob_up"] == pytest.approx(0.11)
    assert after["one_day"]["prob_up"] != pytest.approx(original_prob)
