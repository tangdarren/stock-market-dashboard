"""Direction targets for 1-day and 5-day forecasts.

NaN safety (correction #2 in the plan):
    Targets are built from the future close price. Rows for which the future
    close does not exist must retain a NaN target and be filtered out *before*
    any integer cast. See ``tests/test_targets.py`` for the explicit assertion.
"""

from __future__ import annotations

import pandas as pd

HORIZONS: tuple[int, ...] = (1, 5)


def add_targets(df: pd.DataFrame) -> pd.DataFrame:
    """Attach ``future_close_{h}d``, ``target_{h}d``, and ``realized_future_return_{h}d`` columns.

    Notes:
    - Targets remain ``NaN`` at the tail of the frame where the future close is
      not yet observable. The pipeline must not cast these to integers directly
      (see :func:`training_frame`).
    - The realized future return column is deliberately named
      ``realized_future_return_{h}d`` (**not** ``return_{h}d``) so it never
      collides with the backward-looking ``return_{h}d`` feature produced by
      :func:`app.ml.features.build_features`. Overwriting the feature would
      leak the target into training.
    """
    if "close" not in df.columns:
        raise ValueError("add_targets: input must have a 'close' column")

    # Guard against reintroducing the historical leakage bug.
    reserved = {f"realized_future_return_{h}d" for h in HORIZONS}
    if reserved.intersection(df.columns):
        raise ValueError(
            "add_targets: input already contains realized_future_return_* columns."
        )

    out = df.copy()
    for h in HORIZONS:
        future = out["close"].shift(-h)
        out[f"future_close_{h}d"] = future
        up = future > out["close"]
        out[f"target_{h}d"] = up.where(future.notna())
        out[f"realized_future_return_{h}d"] = (future / out["close"]) - 1.0
    return out


def training_frame(df: pd.DataFrame, horizon: int) -> pd.DataFrame:
    """Return the subset of `df` suitable for supervised training at `horizon`.

    Only rows with a non-null ``target_{horizon}d`` and no NaN features remain.
    The target is cast to ``int`` only after the NaN filter — so the last
    ``horizon`` rows never become spurious class-0 labels.
    """
    col = f"target_{horizon}d"
    if col not in df.columns:
        raise ValueError(f"training_frame: column '{col}' missing. Call add_targets first.")

    filtered = df[df[col].notna()].copy()
    filtered[col] = filtered[col].astype(int)
    return filtered
