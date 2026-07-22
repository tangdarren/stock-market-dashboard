"""Rolling performance and feature-drift monitoring for the Model Health Center.

Computes chronological rolling metrics from the walk-forward evaluation
artifact, and Population Stability Index (PSI) feature drift against the
training-time ``monitoring_reference.json`` distributions.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss

from app import config as _config
from app.ml.artifacts import ArtifactMissing, artifact_path, read_json
from app.ml.evaluate import average_predicted_confidence, expected_calibration_error
from app.ml.features import FEATURE_NAMES, build_features, feature_schema_fingerprint
from app.ml.normalize import normalize_ohlcv
from app.ml.replay import (
    SUPPORTED_HORIZONS,
    complete_walk_forward_rows,
    prepare_walk_forward_frame,
)

WALK_FORWARD_FILENAME = "walk_forward_predictions.csv"
METRICS_FILENAME = "metrics.json"
MONITORING_REFERENCE_FILENAME = "monitoring_reference.json"
HISTORICAL_CSV_FILENAME = "spy_daily.csv"

DEFAULT_WINDOWS: tuple[int, ...] = (30, 60, 120, 252)
CALIBRATION_BINS = 10
DEFAULT_PSI_BINS = 10
PSI_EPSILON = 1e-4

# Centralized, transparent PSI thresholds (industry-standard bands).
PSI_STABLE_MAX = 0.10
PSI_WATCH_MAX = 0.25

DriftStatus = Literal["stable", "watch", "drift_detected", "insufficient_data"]

BASELINE_METRIC_KEYS: tuple[str, ...] = (
    "accuracy",
    "brier",
    "ece",
    "average_predicted_confidence",
    "actual_accuracy",
)

PSI_THRESHOLDS: dict[str, float] = {
    "stable_max": PSI_STABLE_MAX,
    "watch_max": PSI_WATCH_MAX,
}


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


def _finite_values(values: np.ndarray | pd.Series) -> np.ndarray:
    arr = np.asarray(values, dtype=float).reshape(-1)
    return arr[np.isfinite(arr)]


# ---------------------------------------------------------------------------
# Rolling model performance
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Feature-drift reference distributions (training-time)
# ---------------------------------------------------------------------------


def classify_psi(psi: float | None) -> DriftStatus:
    """Map a PSI score onto centralized stable / watch / drift bands."""
    if psi is None or not np.isfinite(psi):
        return "insufficient_data"
    if psi < PSI_STABLE_MAX:
        return "stable"
    if psi < PSI_WATCH_MAX:
        return "watch"
    return "drift_detected"


def population_stability_index(
    expected_proportions: np.ndarray,
    actual_proportions: np.ndarray,
    *,
    epsilon: float = PSI_EPSILON,
) -> float:
    """PSI with clipped empty bins so zero shares do not explode the log."""
    expected = np.asarray(expected_proportions, dtype=float).reshape(-1)
    actual = np.asarray(actual_proportions, dtype=float).reshape(-1)
    if expected.shape != actual.shape:
        raise ValueError(
            f"PSI proportion shapes differ: expected {expected.shape}, actual {actual.shape}"
        )
    if expected.size == 0:
        return 0.0
    e = np.clip(expected, epsilon, None)
    a = np.clip(actual, epsilon, None)
    e = e / e.sum()
    a = a / a.sum()
    return float(np.sum((a - e) * np.log(a / e)))


def _quantile_bin_edges(values: np.ndarray, n_bins: int) -> np.ndarray:
    """Build increasing bin edges from quantiles, collapsing duplicates safely."""
    if n_bins < 1:
        raise ValueError(f"n_bins must be >= 1, got {n_bins}")
    quantiles = np.linspace(0.0, 1.0, n_bins + 1)
    edges = np.quantile(values, quantiles)
    return np.unique(edges.astype(float))


def _bin_counts(values: np.ndarray, edges: np.ndarray) -> np.ndarray:
    """Assign values to reference bins; clip outliers into the outer bins."""
    n_bins = int(len(edges) - 1)
    if n_bins <= 0:
        return np.array([float(len(values))], dtype=float)
    interior = edges[1:-1]
    if interior.size == 0:
        return np.array([float(len(values))], dtype=float)
    idx = np.searchsorted(interior, values, side="right")
    idx = np.clip(idx, 0, n_bins - 1)
    return np.bincount(idx, minlength=n_bins).astype(float)


def build_feature_reference(
    values: np.ndarray | pd.Series,
    *,
    feature_name: str,
    n_bins: int = DEFAULT_PSI_BINS,
) -> dict[str, Any]:
    """Compact reference distribution for one numeric feature."""
    finite = _finite_values(values)
    n_valid = int(finite.size)
    if n_valid == 0:
        return {
            "name": feature_name,
            "bin_edges": [],
            "proportions": [],
            "mean": None,
            "std": None,
            "n_valid": 0,
            "constant": False,
        }

    mean = float(np.mean(finite))
    std = float(np.std(finite, ddof=0))
    unique_vals = np.unique(finite)
    if unique_vals.size == 1:
        constant = float(unique_vals[0])
        return {
            "name": feature_name,
            "bin_edges": [constant, constant],
            "proportions": [1.0],
            "mean": constant,
            "std": 0.0,
            "n_valid": n_valid,
            "constant": True,
        }

    edges = _quantile_bin_edges(finite, n_bins)
    if edges.size < 2:
        constant = float(finite[0])
        return {
            "name": feature_name,
            "bin_edges": [constant, constant],
            "proportions": [1.0],
            "mean": mean,
            "std": std,
            "n_valid": n_valid,
            "constant": True,
        }

    counts = _bin_counts(finite, edges)
    proportions = (counts / counts.sum()).tolist()
    return {
        "name": feature_name,
        "bin_edges": [float(x) for x in edges.tolist()],
        "proportions": [float(x) for x in proportions],
        "mean": mean,
        "std": std,
        "n_valid": n_valid,
        "constant": False,
    }


def build_horizon_feature_reference(
    train_features: pd.DataFrame,
    *,
    horizon_days: int,
    train_start: Any,
    train_end: Any,
    n_bins: int = DEFAULT_PSI_BINS,
    feature_names: tuple[str, ...] = FEATURE_NAMES,
) -> dict[str, Any]:
    """Reference distributions for every model input feature on the train split."""
    missing = set(feature_names) - set(train_features.columns)
    if missing:
        raise ValueError(
            f"Training frame missing feature columns for monitoring reference: "
            f"{sorted(missing)}"
        )

    features_out: dict[str, Any] = {}
    for name in feature_names:
        features_out[name] = build_feature_reference(
            train_features[name],
            feature_name=name,
            n_bins=n_bins,
        )

    return {
        "horizon_days": int(horizon_days),
        "n_train_rows": int(len(train_features)),
        "train_start": _format_date(train_start),
        "train_end": _format_date(train_end),
        "n_bins": int(n_bins),
        "features": features_out,
    }


def assemble_monitoring_reference(
    horizon_references: dict[int, dict[str, Any]],
    *,
    feature_names: tuple[str, ...] = FEATURE_NAMES,
    n_bins: int = DEFAULT_PSI_BINS,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the compact ``monitoring_reference.json`` payload."""
    stamp = generated_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "generated_at": stamp,
        "feature_schema_fingerprint": feature_schema_fingerprint(),
        "features": list(feature_names),
        "n_bins": int(n_bins),
        "psi_thresholds": dict(PSI_THRESHOLDS),
        "horizons": {
            _horizon_key(horizon): payload
            for horizon, payload in sorted(horizon_references.items())
        },
    }


# ---------------------------------------------------------------------------
# Feature-drift scoring (inference / monitoring time)
# ---------------------------------------------------------------------------


def _feature_summary(values: np.ndarray) -> dict[str, Any]:
    finite = _finite_values(values)
    if finite.size == 0:
        return {"mean": None, "std": None, "n_valid": 0}
    return {
        "mean": float(np.mean(finite)),
        "std": float(np.std(finite, ddof=0)),
        "n_valid": int(finite.size),
    }


def _psi_explanation(
    *,
    feature_name: str,
    status: DriftStatus,
    psi: float | None,
    n_recent: int,
    window: int,
) -> str:
    if status == "insufficient_data":
        return (
            f"{feature_name}: need at least {window} complete recent observations "
            f"to score drift (have {n_recent})."
        )
    assert psi is not None
    if status == "stable":
        return (
            f"{feature_name} looks stable versus training "
            f"(PSI={psi:.3f}, below {PSI_STABLE_MAX:.2f})."
        )
    if status == "watch":
        return (
            f"{feature_name} has mild distribution shift versus training "
            f"(PSI={psi:.3f}; watch band is "
            f"[{PSI_STABLE_MAX:.2f}, {PSI_WATCH_MAX:.2f}))."
        )
    return (
        f"{feature_name} has drifted versus training "
        f"(PSI={psi:.3f}, at or above {PSI_WATCH_MAX:.2f})."
    )


def score_feature_drift(
    recent_values: np.ndarray | pd.Series,
    reference: dict[str, Any],
    *,
    window: int,
) -> dict[str, Any]:
    """Compare one feature's recent values to its training reference via PSI."""
    feature_name = str(reference.get("name") or "feature")
    recent_summary = _feature_summary(np.asarray(recent_values, dtype=float))
    ref_stats = {
        "mean": reference.get("mean"),
        "std": reference.get("std"),
        "n_valid": reference.get("n_valid"),
    }
    n_recent = int(recent_summary["n_valid"])

    if n_recent < window:
        status: DriftStatus = "insufficient_data"
        return {
            "feature": feature_name,
            "psi": None,
            "status": status,
            "recent": recent_summary,
            "reference": ref_stats,
            "explanation": _psi_explanation(
                feature_name=feature_name,
                status=status,
                psi=None,
                n_recent=n_recent,
                window=window,
            ),
        }

    finite = _finite_values(recent_values)
    if reference.get("constant"):
        constant = float(reference["mean"])
        match_rate = float(np.mean(np.isclose(finite, constant, rtol=0.0, atol=1e-12)))
        expected = np.array([1.0, 0.0], dtype=float)
        actual = np.array([match_rate, 1.0 - match_rate], dtype=float)
        psi = population_stability_index(expected, actual)
    else:
        edges = np.asarray(reference.get("bin_edges") or [], dtype=float)
        expected = np.asarray(reference.get("proportions") or [], dtype=float)
        if edges.size < 2 or expected.size == 0:
            status = "insufficient_data"
            return {
                "feature": feature_name,
                "psi": None,
                "status": status,
                "recent": recent_summary,
                "reference": ref_stats,
                "explanation": (
                    f"{feature_name}: reference distribution is empty or incomplete."
                ),
            }
        counts = _bin_counts(finite, edges)
        actual = counts / counts.sum()
        if actual.shape != expected.shape:
            status = "insufficient_data"
            return {
                "feature": feature_name,
                "psi": None,
                "status": status,
                "recent": recent_summary,
                "reference": ref_stats,
                "explanation": (
                    f"{feature_name}: reference bin count does not match "
                    "recent binning; retrain to refresh monitoring_reference.json."
                ),
            }
        psi = population_stability_index(expected, actual)

    status = classify_psi(psi)
    return {
        "feature": feature_name,
        "psi": psi,
        "status": status,
        "recent": recent_summary,
        "reference": ref_stats,
        "explanation": _psi_explanation(
            feature_name=feature_name,
            status=status,
            psi=psi,
            n_recent=n_recent,
            window=window,
        ),
    }


def compute_feature_drift(
    recent_features: pd.DataFrame,
    reference_artifact: dict[str, Any],
    *,
    windows: tuple[int, ...] = DEFAULT_WINDOWS,
    horizons: tuple[int, ...] = SUPPORTED_HORIZONS,
) -> dict[str, Any]:
    """Score PSI drift for each horizon/window against the saved reference."""
    fingerprint = reference_artifact.get("feature_schema_fingerprint")
    expected_fp = feature_schema_fingerprint()
    schema_features = list(reference_artifact.get("features") or FEATURE_NAMES)
    if list(schema_features) != list(FEATURE_NAMES) or fingerprint != expected_fp:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "feature_schema_fingerprint": fingerprint,
            "psi_thresholds": dict(PSI_THRESHOLDS),
            "reason": "feature_schema_mismatch",
            "detail": (
                "monitoring_reference.json feature schema does not match the "
                "current FEATURE_NAMES fingerprint. Retrain via "
                "`python server/scripts/train_models.py`."
            ),
        }

    missing_cols = set(FEATURE_NAMES) - set(recent_features.columns)
    if missing_cols:
        raise ValueError(
            f"Recent feature frame missing columns: {sorted(missing_cols)}"
        )

    if "date" in recent_features.columns:
        frame = recent_features.sort_values("date").reset_index(drop=True)
    else:
        frame = recent_features.reset_index(drop=True)
    n_available = int(len(frame))
    ref_horizons = reference_artifact.get("horizons") or {}

    horizon_payload: dict[str, Any] = {}
    for horizon in horizons:
        key = _horizon_key(horizon)
        horizon_ref = ref_horizons.get(key)
        if not isinstance(horizon_ref, dict):
            horizon_payload[key] = {
                "available": False,
                "reason": "monitoring_reference_horizon_missing",
                "detail": f"No reference distributions for horizon {key}.",
                "windows": {},
            }
            continue

        feature_refs = horizon_ref.get("features") or {}
        window_payload: dict[str, Any] = {}
        for window in windows:
            sufficient = n_available >= window
            recent_slice = frame.iloc[-window:] if sufficient else frame
            feature_scores: list[dict[str, Any]] = []
            for name in FEATURE_NAMES:
                ref = feature_refs.get(name)
                if not isinstance(ref, dict):
                    feature_scores.append(
                        {
                            "feature": name,
                            "psi": None,
                            "status": "insufficient_data",
                            "recent": {"mean": None, "std": None, "n_valid": 0},
                            "reference": {
                                "mean": None,
                                "std": None,
                                "n_valid": None,
                            },
                            "explanation": (
                                f"{name}: missing from monitoring reference; retrain."
                            ),
                        }
                    )
                    continue
                feature_scores.append(
                    score_feature_drift(
                        recent_slice[name],
                        ref,
                        window=window,
                    )
                )

            status_counts = {
                "stable": 0,
                "watch": 0,
                "drift_detected": 0,
                "insufficient_data": 0,
            }
            for row in feature_scores:
                status_counts[str(row["status"])] = (
                    status_counts.get(str(row["status"]), 0) + 1
                )

            start_date = None
            end_date = None
            if sufficient and "date" in recent_slice.columns and len(recent_slice):
                start_date = _format_date(recent_slice["date"].iloc[0])
                end_date = _format_date(recent_slice["date"].iloc[-1])

            window_payload[str(window)] = {
                "window": int(window),
                "sufficient": sufficient,
                "n_available": n_available,
                "n_scored": int(len(recent_slice)) if sufficient else 0,
                "start_date": start_date,
                "end_date": end_date,
                "status_counts": status_counts,
                "features": feature_scores,
            }

        horizon_payload[key] = {
            "available": True,
            "train_start": horizon_ref.get("train_start"),
            "train_end": horizon_ref.get("train_end"),
            "n_train_rows": horizon_ref.get("n_train_rows"),
            "windows": window_payload,
        }

    return {
        "available": True,
        "windows": list(windows),
        "horizons": horizon_payload,
        "feature_schema_fingerprint": expected_fp,
        "psi_thresholds": dict(PSI_THRESHOLDS),
        "reason": None,
        "detail": None,
    }


def load_monitoring_reference() -> dict[str, Any]:
    """Load ``monitoring_reference.json`` from the artifacts directory."""
    try:
        payload = read_json(MONITORING_REFERENCE_FILENAME)
    except ArtifactMissing as exc:
        raise MonitoringError(
            f"Missing artifact: {MONITORING_REFERENCE_FILENAME}",
            reason="monitoring_reference_missing",
        ) from exc
    if not isinstance(payload, dict) or "horizons" not in payload:
        raise MonitoringError(
            "monitoring_reference.json is malformed: missing horizons block.",
            reason="monitoring_reference_malformed",
        )
    return payload


def load_recent_engineered_features(*, min_rows: int = 1) -> pd.DataFrame:
    """Build complete feature rows from the local SPY history CSV."""
    path = Path(_config.DATA_RAW_DIR) / HISTORICAL_CSV_FILENAME
    if not path.exists():
        raise MonitoringError(
            f"Missing historical market CSV: {path.name}",
            reason="market_history_missing",
        )
    try:
        raw = pd.read_csv(path, parse_dates=["date"])
        normalized = normalize_ohlcv(raw, source="cached_local_csv")
        featured = build_features(normalized)
    except (OSError, ValueError, KeyError, TypeError, pd.errors.ParserError) as exc:
        raise MonitoringError(
            f"Unable to engineer recent features from market history: {exc}",
            reason="market_history_malformed",
        ) from exc

    complete = featured.dropna(subset=list(FEATURE_NAMES)).reset_index(drop=True)
    if len(complete) < min_rows:
        raise MonitoringError(
            f"Only {len(complete)} complete feature rows available; need {min_rows}.",
            reason="insufficient_feature_history",
        )
    cols = ["date", *FEATURE_NAMES]
    return complete.loc[:, cols]


def get_feature_drift(
    *,
    windows: tuple[int, ...] = DEFAULT_WINDOWS,
    horizons: tuple[int, ...] = SUPPORTED_HORIZONS,
) -> dict[str, Any]:
    """Load reference + recent features and return PSI drift scores."""
    try:
        reference = load_monitoring_reference()
    except MonitoringError as exc:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "feature_schema_fingerprint": None,
            "psi_thresholds": dict(PSI_THRESHOLDS),
            "reason": exc.reason,
            "detail": exc.message,
        }

    try:
        recent = load_recent_engineered_features(min_rows=1)
    except MonitoringError as exc:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "feature_schema_fingerprint": reference.get("feature_schema_fingerprint"),
            "psi_thresholds": dict(PSI_THRESHOLDS),
            "reason": exc.reason,
            "detail": exc.message,
        }

    try:
        return compute_feature_drift(
            recent,
            reference,
            windows=windows,
            horizons=horizons,
        )
    except ValueError as exc:
        return {
            "available": False,
            "windows": list(windows),
            "horizons": {},
            "feature_schema_fingerprint": reference.get("feature_schema_fingerprint"),
            "psi_thresholds": dict(PSI_THRESHOLDS),
            "reason": "feature_drift_unavailable",
            "detail": str(exc),
        }


__all__ = [
    "BASELINE_METRIC_KEYS",
    "CALIBRATION_BINS",
    "DEFAULT_PSI_BINS",
    "DEFAULT_WINDOWS",
    "METRICS_FILENAME",
    "MONITORING_REFERENCE_FILENAME",
    "MonitoringError",
    "PSI_EPSILON",
    "PSI_STABLE_MAX",
    "PSI_THRESHOLDS",
    "PSI_WATCH_MAX",
    "WALK_FORWARD_FILENAME",
    "assemble_monitoring_reference",
    "build_feature_reference",
    "build_horizon_feature_reference",
    "classify_psi",
    "compute_feature_drift",
    "compute_rolling_model_performance",
    "extract_holdout_baseline",
    "get_feature_drift",
    "get_rolling_model_performance",
    "load_metrics_baseline",
    "load_monitoring_reference",
    "load_recent_engineered_features",
    "load_walk_forward_predictions",
    "population_stability_index",
    "rolling_performance_for_horizon",
    "score_feature_drift",
    "window_performance_metrics",
]
