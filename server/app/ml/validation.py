"""Chronological splits and walk-forward evaluation helpers."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit


@dataclass(frozen=True)
class ChronoSplit:
    train_idx: np.ndarray
    holdout_idx: np.ndarray
    train_start: pd.Timestamp
    train_end: pd.Timestamp
    holdout_start: pd.Timestamp
    holdout_end: pd.Timestamp


def chronological_holdout(
    df: pd.DataFrame,
    *,
    date_col: str = "date",
    holdout_size: int | None = None,
    holdout_fraction: float = 0.15,
) -> ChronoSplit:
    """Reserve the tail of ``df`` (chronologically sorted) as an untouched holdout.

    - If ``holdout_size`` is provided, use exactly that many rows.
    - Otherwise, use ``max(60, holdout_fraction * n)`` rows so small datasets
      still get a usable holdout.
    """
    n = len(df)
    if n < 60:
        raise ValueError(
            f"chronological_holdout: insufficient rows ({n}) for a meaningful split."
        )

    if holdout_size is None:
        holdout_size = max(60, int(round(holdout_fraction * n)))
    if holdout_size >= n - 30:
        raise ValueError(
            "chronological_holdout: holdout would leave <30 training rows. "
            "Reduce holdout_size or provide more history."
        )

    train_idx = np.arange(0, n - holdout_size)
    holdout_idx = np.arange(n - holdout_size, n)

    dates = pd.to_datetime(df[date_col].to_numpy())
    return ChronoSplit(
        train_idx=train_idx,
        holdout_idx=holdout_idx,
        train_start=dates[train_idx[0]],
        train_end=dates[train_idx[-1]],
        holdout_start=dates[holdout_idx[0]],
        holdout_end=dates[holdout_idx[-1]],
    )


def make_time_series_cv(n_splits: int = 5) -> TimeSeriesSplit:
    return TimeSeriesSplit(n_splits=n_splits)
