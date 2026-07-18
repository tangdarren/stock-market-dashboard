"""Feature engineering for SPY direction models.

Each feature at row ``t`` is a function of values ``<= t``. Nothing peeks at the
future. Rolling-window NaNs are preserved so downstream code can decide when to
drop them (after target alignment). A dedicated test asserts leakage-freeness.

The list of feature names produced by :func:`build_features` is exposed as
:data:`FEATURE_NAMES` for artifact validation.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

FEATURE_NAMES: tuple[str, ...] = (
    "return_1d_lag",
    "return_2d",
    "return_5d",
    "return_10d",
    "distance_from_sma_5",
    "distance_from_sma_10",
    "distance_from_sma_20",
    "distance_from_sma_50",
    "ema_12",
    "ema_26",
    "macd",
    "macd_signal",
    "roc_10",
    "consecutive_up_or_down",
    "rolling_vol_5",
    "rolling_vol_20",
    "high_low_range",
    "open_close_range",
    "atr_14",
    "opening_gap_pct",
    "bollinger_band_position_20",
    "volume_change",
    "volume_to_20d_avg",
    "volume_zscore_20",
    "rsi_14",
    "sma_5_over_sma_20",
)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a frame with the canonical OHLCV columns plus all engineered features.

    Input must already be sorted chronologically and normalized (see
    :mod:`app.ml.normalize`).
    """
    _validate_input(df)

    close = df["close"]
    open_ = df["open"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"].astype("float64")

    out = df.copy()

    prev_close = close.shift(1)
    daily_ret = close.pct_change()

    out["return_1d_lag"] = daily_ret
    out["return_2d"] = close.pct_change(2)
    out["return_5d"] = close.pct_change(5)
    out["return_10d"] = close.pct_change(10)

    sma_5 = close.rolling(5).mean()
    sma_10 = close.rolling(10).mean()
    sma_20 = close.rolling(20).mean()
    sma_50 = close.rolling(50).mean()

    out["distance_from_sma_5"] = _percent_distance(close, sma_5)
    out["distance_from_sma_10"] = _percent_distance(close, sma_10)
    out["distance_from_sma_20"] = _percent_distance(close, sma_20)
    out["distance_from_sma_50"] = _percent_distance(close, sma_50)

    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    out["ema_12"] = _percent_distance(close, ema_12)
    out["ema_26"] = _percent_distance(close, ema_26)

    macd = ema_12 - ema_26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    out["macd"] = macd / close
    out["macd_signal"] = macd_signal / close

    out["roc_10"] = close.pct_change(10)

    up_run, down_run = _run_length(daily_ret)
    out["consecutive_up_or_down"] = up_run - down_run

    out["rolling_vol_5"] = daily_ret.rolling(5).std()
    out["rolling_vol_20"] = daily_ret.rolling(20).std()

    out["high_low_range"] = (high - low) / prev_close
    out["open_close_range"] = (close - open_) / open_

    out["atr_14"] = _atr(high, low, close, window=14)

    out["opening_gap_pct"] = (open_ - prev_close) / prev_close

    boll_mean = sma_20
    boll_std = close.rolling(20).std()
    out["bollinger_band_position_20"] = (close - boll_mean) / (2 * boll_std)

    out["volume_change"] = volume.pct_change()
    vol_avg_20 = volume.rolling(20).mean()
    vol_std_20 = volume.rolling(20).std()
    out["volume_to_20d_avg"] = (volume / vol_avg_20) - 1.0
    out["volume_zscore_20"] = (volume - vol_avg_20) / vol_std_20

    out["rsi_14"] = _rsi(close, window=14)

    out["sma_5_over_sma_20"] = (sma_5 / sma_20) - 1.0

    # Replace infinities that arise when a denominator is zero.
    out = out.replace([np.inf, -np.inf], np.nan)

    return out


def latest_feature_row(features_df: pd.DataFrame) -> pd.Series:
    """Return the most recent complete feature vector (drops rows with any NaN)."""
    complete = features_df.dropna(subset=list(FEATURE_NAMES))
    if complete.empty:
        raise ValueError("Not enough history to compute a complete feature row.")
    return complete.iloc[-1]


def _validate_input(df: pd.DataFrame) -> None:
    required = {"date", "open", "high", "low", "close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"build_features: missing required columns: {sorted(missing)}")


def _percent_distance(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a / b) - 1.0


def _run_length(returns: pd.Series) -> tuple[pd.Series, pd.Series]:
    up = (returns > 0).astype(int)
    down = (returns < 0).astype(int)
    up_run = _consecutive(up)
    down_run = _consecutive(down)
    return up_run, down_run


def _consecutive(flags: pd.Series) -> pd.Series:
    """Cumulative consecutive run of ones, reset when the flag flips to zero."""
    result = np.zeros(len(flags), dtype="float64")
    streak = 0
    for i, val in enumerate(flags.to_numpy()):
        streak = streak + 1 if val == 1 else 0
        result[i] = streak
    return pd.Series(result, index=flags.index)


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, *, window: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            (high - low).abs(),
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return (tr.rolling(window).mean()) / close


def _rsi(close: pd.Series, *, window: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window).mean()
    avg_loss = loss.rolling(window).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))
