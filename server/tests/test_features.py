"""Feature engineering must not peek at future values (leak-free)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml.features import FEATURE_NAMES, build_features


def _random_ohlcv(seed: int = 42, n: int = 120) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = np.cumsum(rng.normal(0, 1, size=n)) + 500
    df = pd.DataFrame(
        {
            "date": pd.date_range("2020-01-01", periods=n, freq="B"),
            "open": close + rng.normal(0, 0.3, size=n),
            "high": close + rng.uniform(0.2, 1.5, size=n),
            "low": close - rng.uniform(0.2, 1.5, size=n),
            "close": close,
            "volume": rng.integers(1_000_000, 5_000_000, size=n),
        }
    )
    return df


def test_feature_names_stable():
    df = _random_ohlcv()
    features = build_features(df)
    for name in FEATURE_NAMES:
        assert name in features.columns, f"Missing feature: {name}"


def test_features_do_not_leak_future_values():
    """Perturbing future rows must never alter feature values at earlier rows."""
    df = _random_ohlcv(seed=1)
    baseline = build_features(df)

    perturbed = df.copy()
    tail = 5
    perturbed.loc[perturbed.index[-tail:], "close"] += 100.0
    perturbed.loc[perturbed.index[-tail:], "high"] += 100.0
    perturbed.loc[perturbed.index[-tail:], "low"] += 100.0
    perturbed.loc[perturbed.index[-tail:], "open"] += 100.0
    perturbed_features = build_features(perturbed)

    # Every feature at every row EXCEPT the last `tail` must be identical.
    cutoff = len(df) - tail
    for feat in FEATURE_NAMES:
        base_prefix = baseline[feat].iloc[:cutoff]
        pert_prefix = perturbed_features[feat].iloc[:cutoff]
        pd.testing.assert_series_equal(
            base_prefix,
            pert_prefix,
            check_names=False,
            atol=1e-9,
            rtol=1e-9,
            check_dtype=False,
            obj=f"feature '{feat}' leaked future rows",
        )


def test_features_return_is_backward_looking():
    """`return_5d` at row t must depend only on close[t-5..t]."""
    df = _random_ohlcv()
    features = build_features(df)
    manual = df["close"].pct_change(5)
    pd.testing.assert_series_equal(
        features["return_5d"], manual, check_names=False, atol=1e-12, rtol=1e-12
    )
