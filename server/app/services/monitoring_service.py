"""Model Health and Drift Center service.

Combines chronological holdout out-of-sample performance and feature-drift PSI
into a single typed monitoring payload for ``GET /api/v1/model/monitoring``.

Design notes
------------
* Reuses :mod:`app.ml.monitoring` calculations — no duplicate metric math.
* Soft failures return ``available: false`` with a machine-readable ``reason``
  rather than fabricating health scores or raising 5xx for missing artifacts.
* When the selected rolling window lacks enough observations, the top-level
  reason is ``insufficient_observations`` even if drift artifacts are also
  missing (those remain secondary ``status_reasons`` / detail).
* When rolling performance is available but feature drift is not, the payload
  remains available with ``feature_drift: null`` and a truthful reason note.
* Overall status is the worst meaningful performance or feature-drift signal
  using the centralized thresholds in ``MONITORING_THRESHOLDS``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from app.ml.monitoring import (
    DEFAULT_WINDOWS,
    MONITORING_THRESHOLDS,
    MonitoringError,
    confidence_vs_accuracy_summary,
    derive_overall_health,
    feature_drift_health_signals,
    get_feature_drift,
    get_rolling_model_performance,
    load_metrics_baseline,
    load_monitoring_reference,
    performance_health_signals,
    rank_feature_drift,
)
from app.services.forecast_service import get_model_version

MonitoringHorizon = Literal["1d", "5d"]
ALLOWED_HORIZONS: tuple[str, ...] = ("1d", "5d")
ALLOWED_WINDOWS: tuple[int, ...] = DEFAULT_WINDOWS


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_horizon(horizon: str) -> int:
    if horizon not in ALLOWED_HORIZONS:
        raise ValueError(f"horizon must be one of {ALLOWED_HORIZONS}, got {horizon!r}")
    return int(horizon.removesuffix("d"))


def _parse_window(window: int) -> int:
    if window not in ALLOWED_WINDOWS:
        raise ValueError(f"window must be one of {ALLOWED_WINDOWS}, got {window!r}")
    return int(window)


def _artifact_generated_at(payload: dict[str, Any] | None) -> str | None:
    if not payload:
        return None
    value = payload.get("generated_at")
    return str(value) if value is not None else None


def _unavailable(
    *,
    horizon: str,
    horizon_days: int,
    window: int,
    reason: str,
    detail: str,
    status_reasons: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "available": False,
        "status": None,
        "status_explanation": detail,
        "status_reasons": list(status_reasons or []),
        "horizon": horizon,
        "horizon_days": horizon_days,
        "window": window,
        "latest_performance": None,
        "baseline": None,
        "rolling_series": [],
        "confidence_vs_accuracy": None,
        "feature_drift": None,
        "observation_counts": {
            "rolling_window": window,
            "rolling_available": 0,
            "rolling_scored": 0,
            "feature_available": 0,
            "feature_scored": 0,
            "baseline": None,
        },
        "timestamps": {
            "generated_at": _now_iso(),
            "metrics_generated_at": None,
            "monitoring_reference_generated_at": None,
            "rolling_start_date": None,
            "rolling_end_date": None,
            "feature_window_start": None,
            "feature_window_end": None,
        },
        "model_version": get_model_version(),
        "thresholds": MONITORING_THRESHOLDS,
        "reason": reason,
        "detail": detail,
    }


class MonitoringService:
    """Assemble the Model Health and Drift Center API payload."""

    def get_monitoring(self, *, horizon: str, window: int) -> dict[str, Any]:
        horizon_days = _parse_horizon(horizon)
        window = _parse_window(window)

        rolling = get_rolling_model_performance(
            windows=(window,),
            horizons=(horizon_days,),
        )
        if not rolling.get("available"):
            return _unavailable(
                horizon=horizon,
                horizon_days=horizon_days,
                window=window,
                reason=str(rolling.get("reason") or "walk_forward_artifact_missing"),
                detail=str(
                    rolling.get("detail")
                    or "Out-of-sample monitoring artifacts are unavailable."
                ),
            )

        drift = get_feature_drift(windows=(window,), horizons=(horizon_days,))
        drift_available = bool(drift.get("available"))
        drift_reason = str(drift.get("reason") or "monitoring_reference_missing")
        drift_detail = str(
            drift.get("detail") or "Feature-drift monitoring artifacts are unavailable."
        )

        horizon_key = horizon
        rolling_horizon = (rolling.get("horizons") or {}).get(horizon_key) or {}
        rolling_window = (rolling_horizon.get("windows") or {}).get(str(window)) or {}
        baseline = rolling_horizon.get("baseline")
        rolling_sufficient = bool(rolling_window.get("sufficient"))

        drift_horizon: dict[str, Any] = {}
        drift_window: dict[str, Any] = {}
        if drift_available:
            drift_horizon = (drift.get("horizons") or {}).get(horizon_key) or {}
            if not drift_horizon.get("available", True):
                drift_available = False
                drift_reason = str(
                    drift_horizon.get("reason") or "monitoring_reference_horizon_missing"
                )
                drift_detail = str(
                    drift_horizon.get("detail")
                    or f"No feature-drift reference for horizon {horizon_key}."
                )
            else:
                drift_window = (drift_horizon.get("windows") or {}).get(str(window)) or {}

        drift_sufficient = bool(drift_window.get("sufficient")) if drift_available else False

        if not rolling_sufficient and not drift_sufficient:
            # Rolling window insufficiency is the primary classification blocker.
            # Missing or short drift evidence stays secondary detail when present.
            detail = (
                f"Need at least {window} complete out-of-sample observations "
                "to classify rolling performance for this selection."
            )
            secondary_reasons: list[dict[str, Any]] = []
            if not drift_available:
                detail = (
                    f"{detail} Feature-drift artifacts are also unavailable "
                    f"({drift_reason})."
                )
                secondary_reasons.append(
                    {
                        "source": "feature_drift",
                        "code": drift_reason,
                        "status": "insufficient_data",
                        "detail": drift_detail,
                    }
                )
            elif not drift_sufficient:
                detail = (
                    f"{detail} Feature-drift scoring also lacks enough complete "
                    f"rows for a {window}-session window."
                )
            payload = _unavailable(
                horizon=horizon,
                horizon_days=horizon_days,
                window=window,
                reason="insufficient_observations",
                detail=detail,
                status_reasons=secondary_reasons,
            )
            payload["observation_counts"] = {
                "rolling_window": window,
                "rolling_available": int(rolling_window.get("n_available") or 0),
                "rolling_scored": 0,
                "feature_available": int(drift_window.get("n_available") or 0),
                "feature_scored": 0,
                "baseline": (baseline or {}).get("n_observations") if baseline else None,
            }
            return payload

        latest = rolling_window.get("latest") if rolling_sufficient else None
        series = list(rolling_window.get("series") or []) if rolling_sufficient else []
        feature_scores = (
            list(drift_window.get("features") or []) if drift_sufficient else []
        )
        ranked = rank_feature_drift(feature_scores)

        signals = performance_health_signals(latest) + feature_drift_health_signals(ranked)
        status, status_reasons, status_explanation = derive_overall_health(signals)
        if status == "insufficient_data":
            return _unavailable(
                horizon=horizon,
                horizon_days=horizon_days,
                window=window,
                reason="insufficient_observations",
                detail=status_explanation,
            )

        if not drift_available:
            status_reasons = [
                *status_reasons,
                {
                    "source": "feature_drift",
                    "code": drift_reason,
                    "status": "insufficient_data",
                    "detail": drift_detail,
                },
            ]

        confidence = confidence_vs_accuracy_summary(latest)
        feature_status_counts = drift_window.get("status_counts") or {
            "stable": 0,
            "watch": 0,
            "drift_detected": 0,
            "insufficient_data": 0,
        }

        feature_drift_block = None
        if drift_available and drift_sufficient:
            feature_drift_block = {
                "ranked": ranked,
                "status_counts": feature_status_counts,
                "start_date": drift_window.get("start_date"),
                "end_date": drift_window.get("end_date"),
                "train_start": drift_horizon.get("train_start"),
                "train_end": drift_horizon.get("train_end"),
                "feature_schema_fingerprint": drift.get("feature_schema_fingerprint"),
            }
        elif drift_available and not drift_sufficient:
            feature_drift_block = {
                "ranked": [],
                "status_counts": feature_status_counts,
                "start_date": None,
                "end_date": None,
                "train_start": drift_horizon.get("train_start"),
                "train_end": drift_horizon.get("train_end"),
                "feature_schema_fingerprint": drift.get("feature_schema_fingerprint"),
            }

        metrics_payload = load_metrics_baseline()
        reference_payload = None
        if drift_available:
            try:
                reference_payload = load_monitoring_reference()
            except MonitoringError:
                reference_payload = None

        return {
            "available": True,
            "status": status,
            "status_explanation": status_explanation,
            "status_reasons": status_reasons,
            "horizon": horizon,
            "horizon_days": horizon_days,
            "window": window,
            "latest_performance": latest,
            "baseline": baseline,
            "rolling_series": series,
            "confidence_vs_accuracy": confidence,
            "feature_drift": feature_drift_block,
            "observation_counts": {
                "rolling_window": window,
                "rolling_available": int(rolling_window.get("n_available") or 0),
                "rolling_scored": int(latest.get("n_observations") if latest else 0),
                "feature_available": int(drift_window.get("n_available") or 0),
                "feature_scored": int(drift_window.get("n_scored") or 0),
                "baseline": (baseline or {}).get("n_observations") if baseline else None,
            },
            "timestamps": {
                "generated_at": _now_iso(),
                "metrics_generated_at": _artifact_generated_at(metrics_payload),
                "monitoring_reference_generated_at": _artifact_generated_at(
                    reference_payload
                ),
                "rolling_start_date": latest.get("start_date") if latest else None,
                "rolling_end_date": latest.get("end_date") if latest else None,
                "feature_window_start": drift_window.get("start_date"),
                "feature_window_end": drift_window.get("end_date"),
            },
            "model_version": get_model_version(),
            "thresholds": MONITORING_THRESHOLDS,
            "reason": None if drift_available else drift_reason,
            "detail": None if drift_available else drift_detail,
        }


def get_monitoring_service() -> MonitoringService:
    return MonitoringService()
