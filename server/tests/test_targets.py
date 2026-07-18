"""Targets must not leak future data into features (correction #2)."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.ml.targets import add_targets, training_frame


def _synthetic_ohlcv(n: int = 100) -> pd.DataFrame:
    rng = np.random.default_rng(seed=7)
    close = np.cumsum(rng.normal(0, 1, size=n)) + 100
    return pd.DataFrame(
        {
            "date": pd.date_range("2020-01-01", periods=n, freq="B"),
            "open": close,
            "high": close + 0.5,
            "low": close - 0.5,
            "close": close,
            "volume": rng.integers(1_000_000, 5_000_000, size=n),
        }
    )


def test_final_rows_have_nan_targets():
    df = _synthetic_ohlcv(100)
    with_targets = add_targets(df)

    assert np.isnan(with_targets["target_1d"].iloc[-1])
    assert with_targets["target_5d"].tail(5).isna().all()

    for h in (1, 5):
        assert with_targets[f"target_{h}d"].dtype == object or with_targets[f"target_{h}d"].dtype == float


def test_training_frame_never_produces_artificial_class_zero():
    df = _synthetic_ohlcv(100)
    with_targets = add_targets(df)

    tr1 = training_frame(with_targets, horizon=1)
    tr5 = training_frame(with_targets, horizon=5)

    assert len(tr1) == len(df) - 1
    assert len(tr5) == len(df) - 5

    for col in ("target_1d",):
        assert tr1[col].isna().sum() == 0
        assert set(tr1[col].unique()).issubset({0, 1})
    for col in ("target_5d",):
        assert tr5[col].isna().sum() == 0
        assert set(tr5[col].unique()).issubset({0, 1})


def test_target_and_realized_return_are_consistent():
    df = _synthetic_ohlcv(50)
    with_targets = add_targets(df)

    for h in (1, 5):
        tr = training_frame(with_targets, horizon=h)
        y = tr[f"target_{h}d"].astype(int)
        ret = tr[f"realized_future_return_{h}d"].astype(float)
        assert (y == (ret > 0).astype(int)).all(), (
            f"For horizon={h}d, target should equal sign of realized future return."
        )


def test_add_targets_refuses_second_application():
    """The reserved-column guard prevents the historical leakage bug from resurfacing."""
    df = _synthetic_ohlcv(30)
    once = add_targets(df)
    with pytest.raises(ValueError):
        add_targets(once)
