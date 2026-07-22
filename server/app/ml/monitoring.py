"""Rolling model performance for the Model Health and Drift Center.

Computes chronological rolling metrics from the walk-forward evaluation
artifact, separately for each forecast horizon, and compares each window to
the corresponding holdout baseline in ``metrics.json``.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss

from app.ml.artifacts import ArtifactMissing, artifact_path, read_json
from app.ml.evaluate import average_predicted_confidence, expected_calibration_error
from app.ml.replay import (
    SUPPORTED_HORIZONS,
    complete_walk_forward_rows,
    prepare_walk_forward_frame,
)

WALK_FORWARD_FILENAME = "walk_forward_predictions.csv"
METRICS_FILENAME = "metrics.json"

DEFAULT_WINDOWS: tuple[int, ...] = (30, 60, 120, 252)
CALIBRATION_BINS = 10

BASELINE_METRIC_KEYS: tuple[str, ...] = (
    "accuracy",
    "brier",
    "ece",
    "average_predicted_confidence",
    "actual_accuracy",
)


class MonitoringError(RuntimeError):
    """Structured failure when monitoring artifacts cannot be used."""

    def __init__(self, message: str, *, reason: str):
        super().__init__(message)
        self.reason = reason
        self.message = message


def _format_date(value: Any) -> str:
    return str(pd.Timestamp(value).date())


def _horizon_key(horizon_days: int) -> str:
    return f"{int(horizon_days)}d"


def _delta(value: float | None, baseline: float | None) -> float | None:
    if value is None or baseline is None:
        return None
    return float(value - baseline)


def extract_holdout_baseline(metrics: dict[str, Any], horizon_days: int) -> dict[str, Any]:
    """Pull holdout scalars from ``metrics.json`` for one horizon.

    Metrics absent from the artifact (ECE, average confidence) are returned as
    ``None`` so callers can still report truthful deltas.
    """
    horizons = metrics.get("horizons") or {}
    block = horizons.get(_horizon_key(horizon_days)) or {}
    holdout = block.get("holdout") or {}
    accuracy = holdout.get("accuracy")
    brier = holdout.get("brier")
    accuracy_f = float(accuracy) if accuracy is not None else None
    brier_f = float(brier) if brier is not None else None
    return {
        "accuracy": accuracy_f,
        "brier": brier_f,
        "ece": None,
        "average_predicted_confidence": None,
        "actual_accuracy": accuracy_f,
        "n_observations": holdout.get("n_observations"),
        "test_period_start": holdout.get("test_period_start"),
        "test_period_end": holdout.get("test_period_end"),
    }


def window_performance_metrics(
    y_true: np.ndarray,
    predictions: np.ndarray,
    prob_up: np.ndarray,
    dates: pd.Series,
    *,
    baseline: dict[str, Any] | None = None,
    bins: int = CALIBRATION_BINS,
) -> dict[str, Any]:
    """Compute monitoring metrics for one completed rolling window."""
    y_true = np.asarray(y_true).astype(int)
    predictions = np.asarray(predictions).astype(int)
    prob_up = np.asarray(prob_up).astype(float)
    n = int(len(y_true))
    if n == 0:
        raise ValueError("Cannot compute window metrics with zero observations.")

    accuracy = float(accuracy_score(y_true, predictions))
    brier = float(brier_score_loss(y_true, prob_up))
    ece = expected_calibration_error(y_true, prob_up, bins=bins)
    avg_confidence = average_predicted_confidence(prob_up)
    actual_accuracy = accuracy

    metric_values = {
        "accuracy": accuracy,
        "brier": brier,
        "ece": ece,
        "average_predicted_confidence": avg_confidence,
        "actual_accuracy": actual_accuracy,
    }
    baseline = baseline or {}
    vs_baseline = {
        key: _delta(metric_values[key], baseline.get(key)) for key in BASELINE_METRIC_KEYS
    }

    return {
        "n_observations": n,
        "start_date": _format_date(dates.iloc[0]),
        "end_date": _format_date(dates.iloc[-1]),
        **metric_values,
        "vs_baseline": vs_baseline,
    }


def rolling_performance_for_horizon(
    walk_forward: pd.DataFrame,
    *,
    horizon_days: int,
    window: int,
    baseline: dict[str, Any] | None = None,
    bins: int = CALIBRATION_BINS,
) -> dict[str, Any]:
    """Chronological rolling metrics for one horizon and window size."""
    if window <= 0:
        raise ValueError(f"window must be positive, got {window}")

    complete = complete_walk_forward_rows(walk_forward)
    frame = complete.loc[complete["horizon_days"] == int(horizon_days)].copy()
    frame = frame.sort_values("date").reset_index(drop=True)
    n_available = int(len(frame))

    if n_available < window:
        return {
            "horizon_days": int(horizon_days),
            "window": int(window),
            "sufficient": False,
            "n_available": n_available,
            "series": [],
            "latest": None,
        }

    series: list[dict[str, Any]] = []
    for end in range(window - 1, n_available):
        start = end - window + 1
        slice_ = frame.iloc[start : end + 1]
        point = window_performance_metrics(
            slice_["actual"].to_numpy(),
            slice_["predicted"].to_numpy(),
            slice_["prob_up"].to_numpy(),
            slice_["date"],
            baseline=baseline,
            bins=bins,
        )
        series.append(point)

    return {
        "horizon_days": int(horizon_days),
        "window": int(window),
        "sufficient": True,
        "n_available": n_available,
        "series": series,
        "latest": series[-1] if series else None,
    }


def compute_rolling_model_performance(
    walk_forward: pd.DataFrame,
    metrics: dict[str, Any] | None = None,
    *,
    windows: tuple[int, ...] = DEFAULT_WINDOWS,
    horizons: tuple[int, ...] = SUPPORTED_HORIZONS,
    bins: int = CALIBRATION_BINS,
) -> dict[str, Any]:
    """Build the full multi-horizon / multi-window monitoring payload."""
    # Validate shape early so callers get a clear malformed signal.
    prepare_walk_forward_frame(walk_forward)

    baselines: dict[str, dict[str, Any]] = {}
    baseline_available = metrics is not None
    if metrics is not None:
        for horizon in horizons:
            baselines[_horizon_key(horizon)] = extract_holdout_baseline(metrics, horizon)

    horizon_payload: dict[str, Any] = {}
    for horizon in horizons:
        key = _horizon_key(horizon)
        baseline = baselines.get(key) if baseline_available else None
        window_payload: dict[str, Any] = {}
        for window in windows:
            window_payload[str(window)] = rolling_performance_for_horizon(
                walk_forward,
                horizon_days=horizon,
                window=window,
                baseline=baseline,
                bins=bins,
            )
        horizon_payload[key] = {
            "baseline": baseline,
            "windows": window_payload,
        }

    return {
        "available": True,
        "windows": list(windows),
        "horizons": horizon_payload,
        "baseline_available": baseline_available,
        "reason": None if baseline_available else "metrics_artifact_missing",
        "detail": None
        if baseline_available
        else (
            f"Missing artifact: {METRICS_FILENAME}. Rolling metrics are computed "
            "without vs-baseline deltas."
        ),
    }


def load_walk_forward_predictions() -> pd.DataFrame:
    """Load and validate ``walk_forward_predictions.csv`` from the artifacts dir."""
    path = artifact_path(WALK_FORWARD_FILENAME)
    if not path.exists():
        raise MonitoringError(
            f"Missing artifact: {WALK_FORWARD_FILENAME}",
            reason="walk_forward_artifact_missing",
        )
    try:
        raw = pd.read_csv(path)
    except (pd.errors.ParserError, ValueError, UnicodeDecodeError) as exc:
        raise MonitoringError(
            f"Walk-forward predictions artifact is malformed: {exc}",
            reason="walk_forward_artifact_malformed",
        ) from exc

    try:
        return prepare_walk_forward_frame(raw)
    except ValueError as exc:
        raise MonitoringError(
            f"Walk-forward predictions artifact is malformed: {exc}",
            reason="walk_forward_artifact_malformed",
        ) from exc


def load_metrics_baseline() -> dict[str, Any] | None:
    """Read ``metrics.json`` if present; ``None`` when absent."""
    try:
        return read_json(METRICS_FILENAME)
    except ArtifactMissing:
        return None


def get_rolling_model_performance(
    *,
    windows: tuple[int, ...] = DEFAULT_WINDOWS,
    horizons: tuple[int, ...] = SUPPORTED_HORIZONS,
) -> dict[str, Any]:
    """Load artifacts and return rolling performance or a truthful unavailable payload."""
    try:
        walk_forward = load_walk_forward_predictions()
    except MonitoringError as exc:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "baseline_available": False,
            "reason": exc.reason,
            "detail": exc.message,
        }

    metrics = load_metrics_baseline()
    try:
        return compute_rolling_model_performance(
            walk_forward,
            metrics,
            windows=windows,
            horizons=horizons,
        )
    except ValueError as exc:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "baseline_available": metrics is not None,
            "reason": "walk_forward_artifact_malformed",
            "detail": str(exc),
        }


__all__ = [
    "BASELINE_METRIC_KEYS",
    "CALIBRATION_BINS",
    "DEFAULT_WINDOWS",
    "METRICS_FILENAME",
    "MonitoringError",
    "WALK_FORWARD_FILENAME",
    "compute_rolling_model_performance",
    "extract_holdout_baseline",
    "get_rolling_model_performance",
    "load_metrics_baseline",
    "load_walk_forward_predictions",
    "rolling_performance_for_horizon",
    "window_performance_metrics",
]
