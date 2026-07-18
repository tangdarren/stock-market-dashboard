"""Explainability helpers.

Two explanation strategies are supported:

- Logistic Regression pipeline (StandardScaler + LR): standardized
  ``feature * coef`` contributions.
- Tree ensembles: global permutation importance computed at training time and
  stored in :mod:`app.ml.artifacts`, combined with the direction of the current
  feature relative to the training median. Clearly labelled as
  ``"Global importance x current context (not a causal explanation)."``
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.ml.features import FEATURE_NAMES

PLAIN_ENGLISH: dict[str, tuple[str, str]] = {
    # feature -> (up_phrase, down_phrase)
    "return_1d_lag": (
        "Yesterday's session closed higher.",
        "Yesterday's session closed lower.",
    ),
    "return_5d": (
        "The five-day trend is positive.",
        "The five-day trend is negative.",
    ),
    "return_10d": (
        "The ten-day trend is positive.",
        "The ten-day trend is negative.",
    ),
    "distance_from_sma_20": (
        "SPY is trading above its 20-day moving average.",
        "SPY is trading below its 20-day moving average.",
    ),
    "distance_from_sma_50": (
        "SPY is above its 50-day moving average.",
        "SPY is below its 50-day moving average.",
    ),
    "macd": (
        "MACD is positive (short EMA above long EMA).",
        "MACD is negative (short EMA below long EMA).",
    ),
    "rsi_14": (
        "14-day RSI is on the strong side.",
        "14-day RSI is on the weak side.",
    ),
    "rolling_vol_20": (
        "20-day realized volatility is elevated.",
        "20-day realized volatility is subdued.",
    ),
    "atr_14": (
        "Average True Range is elevated.",
        "Average True Range is subdued.",
    ),
    "volume_to_20d_avg": (
        "Volume is above its 20-day average.",
        "Volume is below its 20-day average.",
    ),
    "bollinger_band_position_20": (
        "Price is near the upper Bollinger band.",
        "Price is near the lower Bollinger band.",
    ),
    "opening_gap_pct": (
        "SPY opened with an upside gap.",
        "SPY opened with a downside gap.",
    ),
}


def _phrase_for(feature: str, direction: str) -> str:
    up_phrase, down_phrase = PLAIN_ENGLISH.get(
        feature,
        (f"{feature} is above its recent average.", f"{feature} is below its recent average."),
    )
    return up_phrase if direction == "up" else down_phrase


def explain_logistic_regression(
    pipeline: Pipeline, current_features: pd.Series
) -> list[dict[str, Any]]:
    scaler: StandardScaler = pipeline.named_steps["scaler"]
    clf: LogisticRegression = pipeline.named_steps["clf"]

    feature_names = list(FEATURE_NAMES)
    x = current_features.reindex(feature_names).to_numpy(dtype=float).reshape(1, -1)
    x_scaled = scaler.transform(x).ravel()
    contributions = x_scaled * clf.coef_.ravel()

    factors: list[dict[str, Any]] = []
    for name, value, contrib in zip(feature_names, current_features.reindex(feature_names).to_numpy(dtype=float), contributions, strict=True):
        direction = "up" if contrib > 0 else "down"
        factors.append(
            {
                "label": name,
                "feature": name,
                "value": _finite(value),
                "direction": direction,
                "contribution": float(contrib),
                "plain_english": _phrase_for(name, direction),
            }
        )
    return factors


def explain_tree_model(
    permutation_importance_by_feature: dict[str, float],
    current_features: pd.Series,
    training_medians: dict[str, float],
) -> list[dict[str, Any]]:
    factors: list[dict[str, Any]] = []
    for name in FEATURE_NAMES:
        importance = float(permutation_importance_by_feature.get(name, 0.0))
        value = float(current_features.get(name, np.nan)) if not pd.isna(current_features.get(name, np.nan)) else 0.0
        median = float(training_medians.get(name, 0.0))
        direction = "up" if value >= median else "down"
        factors.append(
            {
                "label": name,
                "feature": name,
                "value": _finite(value),
                "direction": direction,
                "contribution": importance if direction == "up" else -importance,
                "plain_english": _phrase_for(name, direction),
            }
        )
    return factors


def top_factors(
    factors: list[dict[str, Any]], *, top_n: int = 4
) -> dict[str, list[dict[str, Any]]]:
    """Split factors into up-supporting / down-supporting / uncertainty groups."""
    up = sorted(
        (f for f in factors if f["contribution"] > 0),
        key=lambda f: f["contribution"],
        reverse=True,
    )[:top_n]
    down = sorted(
        (f for f in factors if f["contribution"] < 0),
        key=lambda f: f["contribution"],
    )[:top_n]
    uncertainty = sorted(factors, key=lambda f: abs(f["contribution"]))[:top_n]
    for u in uncertainty:
        u_copy = dict(u)
        u_copy["direction"] = "uncertainty"
        u_copy["plain_english"] = (
            f"{u['feature']} is near its recent typical level; only weak signal."
        )
    return {
        "up": up,
        "down": down,
        "uncertainty": [
            {**u, "direction": "uncertainty", "plain_english": (
                f"{u['feature']} is near its recent typical level; only weak signal."
            )}
            for u in uncertainty
        ],
    }


def _finite(value: float) -> float:
    return float(value) if np.isfinite(value) else 0.0
