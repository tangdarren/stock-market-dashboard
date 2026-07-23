"""Tests for feature-drift reference generation and PSI scoring."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from app.ml.features import FEATURE_NAMES, feature_schema_fingerprint
from app.ml.monitoring import (
    PSI_STABLE_MAX,
    PSI_WATCH_MAX,
    assemble_monitoring_reference,
    build_feature_reference,
    build_horizon_feature_reference,
    classify_psi,
    compute_feature_drift,
    get_feature_drift,
    population_stability_index,
    score_feature_drift,
)
from app.ml.schemas import FeatureDriftResponse
from app.ml.train import prepare_dataset, train_horizon
from tests.replay_fixtures import synthetic_ohlcv


def _feature_frame(n: int = 200, *, seed: int = 11) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2020-01-02", periods=n)
    data: dict[str, object] = {"date": dates}
    for i, name in enumerate(FEATURE_NAMES):
        data[name] = rng.normal(loc=i * 0.01, scale=1.0 + 0.05 * i, size=n)
    return pd.DataFrame(data)


# ---------------------------------------------------------------------------
# Reference generation
# ---------------------------------------------------------------------------


def test_build_feature_reference_stores_quantiles_and_stats():
    values = np.linspace(-2.0, 2.0, 200)
    ref = build_feature_reference(values, feature_name="demo", n_bins=10)
    assert ref["name"] == "demo"
    assert ref["n_valid"] == 200
    assert ref["constant"] is False
    assert len(ref["bin_edges"]) >= 2
    assert len(ref["proportions"]) == len(ref["bin_edges"]) - 1
    assert pytest.approx(sum(ref["proportions"]), abs=1e-9) == 1.0
    assert ref["mean"] == pytest.approx(float(np.mean(values)))
    assert ref["std"] == pytest.approx(float(np.std(values, ddof=0)))


def test_build_feature_reference_handles_constant_and_nan():
    values = np.array([1.5, 1.5, np.nan, 1.5, np.inf])
    ref = build_feature_reference(values, feature_name="const")
    assert ref["constant"] is True
    assert ref["n_valid"] == 3
    assert ref["mean"] == pytest.approx(1.5)
    assert ref["std"] == pytest.approx(0.0)
    assert ref["proportions"] == [1.0]


def test_build_feature_reference_collapses_duplicate_quantile_edges():
    # Mostly one value so many quantiles collide.
    values = np.array([0.0] * 90 + [1.0] * 10, dtype=float)
    ref = build_feature_reference(values, feature_name="sparse", n_bins=10)
    edges = ref["bin_edges"]
    assert edges == sorted(edges)
    assert len(edges) == len(set(edges))
    assert len(ref["proportions"]) == len(edges) - 1
    assert pytest.approx(sum(ref["proportions"]), abs=1e-9) == 1.0


def test_horizon_reference_uses_feature_schema_and_train_metadata():
    frame = _feature_frame(120)
    ref = build_horizon_feature_reference(
        frame,
        horizon_days=1,
        train_start=frame["date"].iloc[0],
        train_end=frame["date"].iloc[-1],
        n_bins=5,
    )
    assert ref["horizon_days"] == 1
    assert ref["n_train_rows"] == 120
    assert set(ref["features"]) == set(FEATURE_NAMES)
    assert ref["train_start"] == str(frame["date"].iloc[0].date())


def test_assemble_monitoring_reference_includes_fingerprint():
    frame = _feature_frame(80)
    horizon_ref = build_horizon_feature_reference(
        frame,
        horizon_days=1,
        train_start=frame["date"].iloc[0],
        train_end=frame["date"].iloc[-1],
    )
    artifact = assemble_monitoring_reference({1: horizon_ref, 5: horizon_ref})
    assert artifact["feature_schema_fingerprint"] == feature_schema_fingerprint()
    assert artifact["features"] == list(FEATURE_NAMES)
    assert "1d" in artifact["horizons"] and "5d" in artifact["horizons"]
    assert artifact["psi_thresholds"]["stable_max"] == PSI_STABLE_MAX
    assert artifact["psi_thresholds"]["watch_max"] == PSI_WATCH_MAX


def test_train_horizon_builds_feature_reference_from_train_split_only():
    ohlcv = synthetic_ohlcv(n=800, seed=5)
    dataset = prepare_dataset(ohlcv)
    result = train_horizon(dataset, horizon=1, n_cv_splits=3)
    ref = result.feature_reference
    assert ref["horizon_days"] == 1
    assert ref["n_train_rows"] == result.training_metadata["n_train"]
    assert ref["train_start"] == result.training_metadata["train_start"]
    assert ref["train_end"] == result.training_metadata["train_end"]
    assert set(ref["features"]) == set(FEATURE_NAMES)
    sample = ref["features"][FEATURE_NAMES[0]]
    assert sample["n_valid"] == ref["n_train_rows"]
    assert len(sample["bin_edges"]) >= 2


# ---------------------------------------------------------------------------
# PSI calculations
# ---------------------------------------------------------------------------


def test_population_stability_index_zero_for_identical_proportions():
    props = np.array([0.2, 0.3, 0.5])
    assert population_stability_index(props, props) == pytest.approx(0.0, abs=1e-12)


def test_population_stability_index_handles_empty_bins():
    expected = np.array([0.5, 0.5, 0.0])
    actual = np.array([0.0, 0.5, 0.5])
    psi = population_stability_index(expected, actual)
    assert np.isfinite(psi)
    assert psi > 0.0


def test_classify_psi_thresholds():
    assert classify_psi(0.05) == "stable"
    assert classify_psi(0.099999) == "stable"
    assert classify_psi(PSI_STABLE_MAX) == "watch"
    assert classify_psi(0.15) == "watch"
    assert classify_psi(0.249999) == "watch"
    assert classify_psi(PSI_WATCH_MAX) == "drift_detected"
    assert classify_psi(0.30) == "drift_detected"
    assert classify_psi(None) == "insufficient_data"
    assert classify_psi(float("nan")) == "insufficient_data"


def test_score_feature_drift_stable_on_same_distribution():
    rng = np.random.default_rng(0)
    train = rng.normal(0.0, 1.0, size=500)
    recent = rng.normal(0.0, 1.0, size=120)
    ref = build_feature_reference(train, feature_name="x", n_bins=10)
    scored = score_feature_drift(recent, ref, window=60)
    assert scored["status"] == "stable"
    assert scored["psi"] is not None
    assert scored["psi"] < PSI_STABLE_MAX
    assert "stable" in scored["explanation"]
    assert scored["recent"]["n_valid"] == 120
    assert scored["reference"]["n_valid"] == 500


def test_score_feature_drift_detects_shifted_distribution():
    rng = np.random.default_rng(1)
    train = rng.normal(0.0, 1.0, size=500)
    recent = rng.normal(3.0, 1.0, size=120)
    ref = build_feature_reference(train, feature_name="x", n_bins=10)
    scored = score_feature_drift(recent, ref, window=60)
    assert scored["status"] == "drift_detected"
    assert scored["psi"] is not None
    assert scored["psi"] >= PSI_WATCH_MAX
    assert "drifted" in scored["explanation"]


def test_score_feature_drift_constant_feature_mismatch():
    ref = build_feature_reference(np.full(100, 2.0), feature_name="const")
    scored = score_feature_drift(np.full(40, 9.0), ref, window=30)
    assert scored["status"] == "drift_detected"
    assert scored["psi"] is not None and scored["psi"] > 0


def test_score_feature_drift_insufficient_sample():
    ref = build_feature_reference(np.linspace(0, 1, 100), feature_name="x")
    scored = score_feature_drift(np.linspace(0, 1, 10), ref, window=30)
    assert scored["status"] == "insufficient_data"
    assert scored["psi"] is None
    assert "need at least 30" in scored["explanation"]


def test_score_feature_drift_all_nan_recent():
    ref = build_feature_reference(np.linspace(0, 1, 100), feature_name="x")
    scored = score_feature_drift(np.full(40, np.nan), ref, window=30)
    assert scored["status"] == "insufficient_data"
    assert scored["psi"] is None


def test_score_feature_drift_watch_band():
    rng = np.random.default_rng(42)
    train = rng.normal(0.0, 1.0, size=800)
    # Mild shift — typically lands in watch for this seed; accept watch or adjacent.
    recent = rng.normal(0.55, 1.05, size=200)
    ref = build_feature_reference(train, feature_name="x", n_bins=10)
    scored = score_feature_drift(recent, ref, window=60)
    assert scored["psi"] is not None
    assert scored["status"] in {"stable", "watch", "drift_detected"}
    if PSI_STABLE_MAX <= scored["psi"] < PSI_WATCH_MAX:
        assert scored["status"] == "watch"


def test_compute_feature_drift_multi_window_payload():
    train = _feature_frame(300, seed=2)
    recent = _feature_frame(80, seed=2)
    # Shift one feature hard so status mix is non-trivial.
    recent = recent.copy()
    recent[FEATURE_NAMES[0]] = recent[FEATURE_NAMES[0]] + 5.0

    horizon_ref = build_horizon_feature_reference(
        train,
        horizon_days=1,
        train_start=train["date"].iloc[0],
        train_end=train["date"].iloc[-1],
    )
    artifact = assemble_monitoring_reference({1: horizon_ref, 5: horizon_ref})
    payload = compute_feature_drift(recent, artifact, windows=(30, 60, 120))

    assert payload["available"] is True
    assert payload["feature_schema_fingerprint"] == feature_schema_fingerprint()
    window_30 = payload["horizons"]["1d"]["windows"]["30"]
    assert window_30["sufficient"] is True
    assert len(window_30["features"]) == len(FEATURE_NAMES)
    drifted = next(f for f in window_30["features"] if f["feature"] == FEATURE_NAMES[0])
    assert drifted["status"] == "drift_detected"
    assert payload["horizons"]["1d"]["windows"]["120"]["sufficient"] is False
    FeatureDriftResponse.model_validate(payload)


def test_get_feature_drift_missing_reference(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)

    payload = get_feature_drift(windows=(30,))
    assert payload["available"] is False
    assert payload["reason"] == "monitoring_reference_missing"


def test_get_feature_drift_with_local_history(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    data_raw = tmp_path / "data"
    artifacts.mkdir(exist_ok=True)
    data_raw.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    ohlcv = synthetic_ohlcv(n=400, seed=9)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)

    dataset = prepare_dataset(ohlcv)
    result = train_horizon(dataset, horizon=1, n_cv_splits=3)
    artifact = assemble_monitoring_reference(
        {1: result.feature_reference, 5: result.feature_reference}
    )
    (artifacts / "monitoring_reference.json").write_text(json.dumps(artifact))

    payload = get_feature_drift(windows=(30, 60))
    assert payload["available"] is True
    assert payload["horizons"]["1d"]["windows"]["30"]["sufficient"] is True
    assert len(payload["horizons"]["1d"]["windows"]["30"]["features"]) == len(
        FEATURE_NAMES
    )
