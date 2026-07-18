"""Smoke test: the training pipeline runs end-to-end on synthetic data."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.ml.features import FEATURE_NAMES
from app.ml.train import prepare_dataset, train_horizon


def _synthetic_ohlcv(n: int = 1500, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    increments = rng.normal(0, 1, size=n)
    close = np.cumsum(increments) + 300
    close = np.clip(close, 50, None)
    return pd.DataFrame(
        {
            "date": pd.date_range("2015-01-01", periods=n, freq="B"),
            "open": close + rng.normal(0, 0.3, size=n),
            "high": close + rng.uniform(0.1, 1.0, size=n),
            "low": close - rng.uniform(0.1, 1.0, size=n),
            "close": close,
            "volume": rng.integers(1_000_000, 5_000_000, size=n),
        }
    )


def test_training_pipeline_runs_and_stays_realistic():
    df = _synthetic_ohlcv()
    dataset = prepare_dataset(df)
    assert len(dataset) > 200
    for f in FEATURE_NAMES:
        assert f in dataset.columns

    result = train_horizon(dataset, horizon=1, n_cv_splits=3)
    hm = result.holdout_metrics

    # Sanity: metrics land in a plausible range.
    assert 0.0 <= hm["accuracy"] <= 1.0
    assert 0.0 <= hm["brier"] <= 1.0
    if hm["roc_auc"] is not None:
        assert 0.0 <= hm["roc_auc"] <= 1.0

    # Post-leak-fix sanity: on random walks, no model should get near-perfect
    # accuracy. If we accidentally reintroduce target leakage, this catches it.
    assert hm["accuracy"] < 0.85, (
        "Suspicious accuracy on random-walk data — check for target leakage."
    )
    if hm["roc_auc"] is not None:
        assert hm["roc_auc"] < 0.85


@pytest.mark.parametrize("horizon", [1, 5])
def test_targets_never_null_in_training_frame(horizon):
    df = _synthetic_ohlcv(500)
    dataset = prepare_dataset(df)
    result = train_horizon(dataset, horizon=horizon, n_cv_splits=3)
    assert result.holdout_metrics["n_observations"] > 30
