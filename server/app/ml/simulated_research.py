"""Derive metrics and monitoring reference payloads from the simulated workbook.

Reuses the same evaluation / backtest / PSI helpers as live training artifacts so
simulated mode exercises identical calculation paths. Nothing here is loaded
unless the caller explicitly opted into simulated mode.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

import pandas as pd

from app.ml.backtest import educational_backtest
from app.ml.evaluate import (
    calibration_curve_points,
    confidence_bucket_breakdown,
    expected_calibration_error,
    holdout_metrics,
    yearly_breakdown,
)
from app.ml.features import FEATURE_NAMES, build_features
from app.ml.monitoring import (
    assemble_monitoring_reference,
    build_horizon_feature_reference,
)
from app.ml.simulated import (
    SIMULATED_DATA_DISCLAIMER,
    SimulatedDataError,
    SimulatedWorkbook,
    get_simulated_workbook,
)

SIMULATED_METRICS_DISCLAIMER = (
    "These metrics and educational backtest figures are computed from fictional "
    "Forecast_History rows in the simulated workbook. They are scenario results "
    "only — not real SPY model performance."
)

SIMULATED_MONITORING_DISCLAIMER = (
    "Model monitoring in simulated mode scores fictional Forecast_History and "
    "synthetic Market_Data rows. Status bands and drift scores are scenario "
    "outputs, not live SPY health."
)

SIMULATED_REPLAY_DISCLAIMER = (
    "Market Replay in simulated mode reconstructs a fictional scenario session "
    "from the synthetic workbook. Walk-forward probabilities and realized "
    "outcomes are not real SPY history or live trading signals."
)

SIMULATED_REPLAY_EVALUATION_NOTE = (
    "These probabilities come from the synthetic Forecast_History sheet — "
    "fictional scenario results, not out-of-sample evaluation of a model "
    "trained on real SPY prices."
)

SIMULATED_BACKTEST_DISCLAIMER = (
    "Educational fictional scenario simulation from synthetic workbook data. "
    "Not real SPY performance. Past fictional outcomes do not imply future results."
)

SIMULATED_MODEL_VERSION = "simulated-scenario"
SIMULATED_SOURCE = "simulated_workbook"


def build_simulated_metrics_payload(
    workbook: SimulatedWorkbook | None = None,
) -> dict[str, Any]:
    """Assemble a metrics.json-shaped payload from Forecast_History."""
    wb = workbook or get_simulated_workbook()
    frame = wb.forecast_history
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    horizons: dict[str, Any] = {}

    for horizon in (1, 5):
        subset = (
            frame.loc[frame["horizon_days"] == horizon]
            .sort_values("date")
            .reset_index(drop=True)
        )
        if subset.empty:
            raise SimulatedDataError(
                f"Forecast_History has no rows for horizon {horizon}d.",
                reason="simulated_forecast_malformed",
            )

        y_true = subset["actual"].to_numpy()
        predictions = subset["predicted"].to_numpy()
        prob_up = subset["prob_up"].to_numpy()
        dates = subset["date"]

        holdout = holdout_metrics(y_true, predictions, prob_up, dates)
        # Surface ECE alongside holdout for monitoring baseline extraction.
        holdout = {
            **holdout,
            "ece": expected_calibration_error(y_true, prob_up),
        }

        backtest: dict[str, Any]
        if horizon == 1:
            backtest = educational_backtest(
                dates=dates,
                realized_returns=subset["realized_return"].to_numpy(),
                prob_up=prob_up,
            )
            if backtest.get("available"):
                backtest = {
                    **backtest,
                    "disclaimer": SIMULATED_BACKTEST_DISCLAIMER,
                }
        else:
            backtest = {
                "available": False,
                "reason": "not_applicable_for_5d",
            }

        horizons[f"{horizon}d"] = {
            "selected_model": "simulated_scenario",
            "model_comparison": {},
            "baselines": {},
            "holdout": holdout,
            "yearly": yearly_breakdown(y_true, predictions, prob_up, dates),
            "confidence_buckets": confidence_bucket_breakdown(y_true, prob_up),
            "calibration": calibration_curve_points(y_true, prob_up),
            "backtest": backtest,
        }

    return {
        "generated_at": generated_at,
        "horizons": horizons,
        "mode": "simulated",
        "source": SIMULATED_SOURCE,
        "data_classification": wb.scenario.data_classification,
        "scenario_name": wb.scenario.scenario_name,
        "disclaimer": SIMULATED_METRICS_DISCLAIMER,
        "warning": wb.scenario.warning or SIMULATED_DATA_DISCLAIMER,
    }


def build_simulated_monitoring_reference(
    workbook: SimulatedWorkbook | None = None,
) -> dict[str, Any]:
    """Build monitoring_reference.json from earlier synthetic Market_Data rows."""
    wb = workbook or get_simulated_workbook()
    featured = build_features(wb.market_data.copy())
    complete = featured.dropna(subset=list(FEATURE_NAMES)).reset_index(drop=True)
    if len(complete) < 60:
        raise SimulatedDataError(
            f"Only {len(complete)} complete synthetic feature rows; need at least 60.",
            reason="insufficient_feature_history",
        )

    # Earlier rows act as the fictional "train" reference; leave a recent tail
    # for rolling PSI windows (up to 252).
    leave_recent = min(252, max(30, len(complete) // 3))
    train_end_idx = len(complete) - leave_recent
    if train_end_idx < 30:
        train_end_idx = max(30, len(complete) // 2)
    train = complete.iloc[:train_end_idx].reset_index(drop=True)
    if len(train) < 30:
        raise SimulatedDataError(
            "Not enough synthetic feature history for a monitoring reference.",
            reason="insufficient_feature_history",
        )

    train_start = train["date"].iloc[0]
    train_end = train["date"].iloc[-1]
    refs: dict[int, dict[str, Any]] = {}
    for horizon in (1, 5):
        refs[horizon] = build_horizon_feature_reference(
            train,
            horizon_days=horizon,
            train_start=train_start,
            train_end=train_end,
        )

    stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    payload = assemble_monitoring_reference(refs, generated_at=stamp)
    payload["mode"] = "simulated"
    payload["source"] = SIMULATED_SOURCE
    payload["disclaimer"] = SIMULATED_MONITORING_DISCLAIMER
    return payload


def load_simulated_engineered_features(*, min_rows: int = 1) -> pd.DataFrame:
    """Complete engineered feature rows from synthetic Market_Data."""
    wb = get_simulated_workbook()
    featured = build_features(wb.market_data.copy())
    complete = featured.dropna(subset=list(FEATURE_NAMES)).reset_index(drop=True)
    if len(complete) < min_rows:
        raise SimulatedDataError(
            f"Only {len(complete)} complete synthetic feature rows; need {min_rows}.",
            reason="insufficient_feature_history",
        )
    cols = ["date", *FEATURE_NAMES]
    return complete.loc[:, cols]


@lru_cache(maxsize=4)
def _cached_simulated_metrics(resolved_path: str) -> dict[str, Any]:
    return build_simulated_metrics_payload(get_simulated_workbook(resolved_path))


@lru_cache(maxsize=4)
def _cached_simulated_monitoring_reference(resolved_path: str) -> dict[str, Any]:
    return build_simulated_monitoring_reference(get_simulated_workbook(resolved_path))


def get_simulated_metrics_payload(
    path: str | None = None,
) -> dict[str, Any]:
    """Process-cached metrics payload for explicit simulated-mode callers."""
    wb = get_simulated_workbook(path)
    return _cached_simulated_metrics(str(wb.source_path))


def get_simulated_monitoring_reference_payload(
    path: str | None = None,
) -> dict[str, Any]:
    """Process-cached monitoring reference for explicit simulated-mode callers."""
    wb = get_simulated_workbook(path)
    return _cached_simulated_monitoring_reference(str(wb.source_path))


def clear_simulated_research_caches() -> None:
    """Drop cached metrics / reference payloads (tests)."""
    _cached_simulated_metrics.cache_clear()
    _cached_simulated_monitoring_reference.cache_clear()


__all__ = [
    "SIMULATED_BACKTEST_DISCLAIMER",
    "SIMULATED_METRICS_DISCLAIMER",
    "SIMULATED_MODEL_VERSION",
    "SIMULATED_MONITORING_DISCLAIMER",
    "SIMULATED_REPLAY_DISCLAIMER",
    "SIMULATED_REPLAY_EVALUATION_NOTE",
    "SIMULATED_SOURCE",
    "build_simulated_metrics_payload",
    "build_simulated_monitoring_reference",
    "clear_simulated_research_caches",
    "get_simulated_metrics_payload",
    "get_simulated_monitoring_reference_payload",
    "load_simulated_engineered_features",
]
