"""Educational walk-forward backtest for the 1-day model.

Uses ONLY out-of-sample predictions on the chronological holdout. The strategy
is deliberately simple: hold SPY when p_up >= threshold, otherwise cash. Each
change of position pays a round-trip transaction cost.

Labelled clearly in the UI as an educational simulation. Past performance does
not guarantee future results.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

DEFAULT_THRESHOLD = 0.60
DEFAULT_COST_BPS = 5  # per side, 5 basis points


def educational_backtest(
    *,
    dates: pd.Series,
    realized_returns: np.ndarray,
    prob_up: np.ndarray,
    threshold: float = DEFAULT_THRESHOLD,
    cost_bps_per_side: float = DEFAULT_COST_BPS,
) -> dict[str, Any]:
    if len(realized_returns) == 0:
        return {
            "available": False,
            "reason": "no_holdout_predictions",
        }

    dates_idx = pd.to_datetime(dates).reset_index(drop=True)
    ret = np.asarray(realized_returns, dtype=float)
    signal = (np.asarray(prob_up) >= threshold).astype(int)
    prev_signal = np.concatenate([[0], signal[:-1]])
    turnover = np.abs(signal - prev_signal)
    cost_per_side = cost_bps_per_side / 10_000.0
    trade_costs = turnover * cost_per_side

    strategy_daily = signal * ret - trade_costs
    buy_hold_daily = ret

    strategy_curve = (1 + strategy_daily).cumprod()
    buy_hold_curve = (1 + buy_hold_daily).cumprod()

    hit_rate = float((signal.astype(bool) & (ret > 0)).sum() / max(1, signal.sum()))
    max_dd = _max_drawdown(strategy_curve)
    trades = int(turnover.sum())

    return {
        "available": True,
        "threshold": float(threshold),
        "cost_bps_per_side": float(cost_bps_per_side),
        "cumulative_return_strategy": float(strategy_curve.iloc[-1] - 1 if hasattr(strategy_curve, "iloc") else strategy_curve[-1] - 1),
        "cumulative_return_buy_hold": float(buy_hold_curve.iloc[-1] - 1 if hasattr(buy_hold_curve, "iloc") else buy_hold_curve[-1] - 1),
        "max_drawdown_strategy": float(max_dd),
        "trades": trades,
        "hit_rate_when_in_market": hit_rate,
        "test_period_start": str(dates_idx.iloc[0].date()),
        "test_period_end": str(dates_idx.iloc[-1].date()),
        "n_days": int(len(ret)),
        "disclaimer": (
            "Educational historical simulation. Past performance does not "
            "guarantee future results."
        ),
    }


def _max_drawdown(equity_curve: np.ndarray | pd.Series) -> float:
    if hasattr(equity_curve, "to_numpy"):
        equity = equity_curve.to_numpy()
    else:
        equity = np.asarray(equity_curve)
    running_peak = np.maximum.accumulate(equity)
    dd = equity / running_peak - 1
    return float(dd.min())
