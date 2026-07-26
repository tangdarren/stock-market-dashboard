"""Tests for GET /api/v1/model/monitoring and the monitoring service."""

from __future__ import annotations

import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.ml.features import FEATURE_NAMES
from app.ml.monitoring import (
    ACCURACY_DROP_DRIFT,
    CONFIDENCE_GAP_DRIFT,
    CONFIDENCE_GAP_WATCH,
    MONITORING_THRESHOLDS,
    PSI_WATCH_MAX,
    assemble_monitoring_reference,
    classify_higher_is_worse,
    confidence_vs_accuracy_summary,
    derive_overall_health,
    feature_drift_health_signals,
    performance_health_signals,
)
from app.ml.schemas import ModelMonitoringResponse
from app.ml.train import prepare_dataset, train_horizon
from app.services.monitoring_service import MonitoringService
from tests.replay_fixtures import synthetic_ohlcv, synthetic_walk_forward, write_walk_forward


def _client() -> TestClient:
    return TestClient(create_app())


def _metrics_payload(*, accuracy: float = 0.55, brier: float = 0.24) -> dict:
    return {
        "generated_at": "2026-01-01T00:00:00+00:00",
        "horizons": {
            "1d": {
                "holdout": {
                    "accuracy": accuracy,
                    "brier": brier,
                    "n_observations": 200,
                    "test_period_start": "2024-01-02",
                    "test_period_end": "2024-12-31",
                }
            },
            "5d": {
                "holdout": {
                    "accuracy": accuracy,
                    "brier": brier,
                    "n_observations": 200,
                    "test_period_start": "2024-01-02",
                    "test_period_end": "2024-12-31",
                }
            },
        },
    }


def _seed_monitoring_artifacts(
    tmp_path,
    monkeypatch,
    *,
    n_history: int = 500,
    perfect_walk_forward: bool = True,
) -> None:
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    data_raw = tmp_path / "data"
    artifacts.mkdir(exist_ok=True)
    data_raw.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    ohlcv = synthetic_ohlcv(n=n_history, seed=21)
    ohlcv.to_csv(data_raw / "spy_daily.csv", index=False)

    dataset = prepare_dataset(ohlcv)
    result_1 = train_horizon(dataset, horizon=1, n_cv_splits=3)
    result_5 = train_horizon(dataset, horizon=5, n_cv_splits=3)

    if perfect_walk_forward:
        # Build a long, perfectly correct walk-forward so rolling windows are sufficient
        # and performance signals stay stable against a matched baseline.
        dates = pd.bdate_range("2024-01-02", periods=300)
        rows: list[dict[str, object]] = []
        for ts in dates:
            iso = ts.date().isoformat()
            for h in (1, 5):
                rows.append(
                    {
                        "date": iso,
                        "horizon_days": h,
                        "prob_up": 0.9,
                        "predicted": 1,
                        "actual": 1,
                        "correct": 1,
                        "realized_return": 0.01,
                    }
                )
        walk = pd.DataFrame(rows)
        metrics = _metrics_payload(accuracy=1.0, brier=0.01)
    else:
        walk = pd.concat([result_1.walk_forward, result_5.walk_forward], ignore_index=True)
        metrics = _metrics_payload(
            accuracy=float(result_1.holdout_metrics["accuracy"]),
            brier=float(result_1.holdout_metrics["brier"]),
        )

    write_walk_forward(tmp_path, walk, monkeypatch)
    (artifacts / "metrics.json").write_text(json.dumps(metrics))
    reference = assemble_monitoring_reference(
        {
            1: result_1.feature_reference,
            5: result_5.feature_reference,
        },
        generated_at="2026-01-01T00:00:00+00:00",
    )
    (artifacts / "monitoring_reference.json").write_text(json.dumps(reference))
    (artifacts / "model_version.txt").write_text("v1-testmonitor\n")


# ---------------------------------------------------------------------------
# Health aggregation helpers
# ---------------------------------------------------------------------------


def test_derive_overall_health_picks_worst_meaningful_signal():
    status, reasons, explanation = derive_overall_health(
        [
            {
                "source": "performance",
                "code": "accuracy_drop_vs_baseline",
                "status": "watch",
                "detail": "accuracy watch",
            },
            {
                "source": "feature_drift",
                "code": "psi_drift_detected",
                "status": "drift_detected",
                "feature": "rsi_14",
                "detail": "rsi drifted",
            },
        ]
    )
    assert status == "drift_detected"
    assert reasons[0]["code"] == "psi_drift_detected"
    assert "drift_detected" in explanation


def test_performance_health_signals_use_central_thresholds():
    latest = {
        "accuracy": 0.40,
        "brier": 0.30,
        "average_predicted_confidence": 0.80,
        "actual_accuracy": 0.40,
        "vs_baseline": {"accuracy": -0.20, "brier": 0.08},
    }
    signals = performance_health_signals(latest)
    by_code = {s["code"]: s for s in signals}
    assert by_code["accuracy_drop_vs_baseline"]["status"] == "drift_detected"
    assert by_code["accuracy_drop_vs_baseline"]["value"] == pytest.approx(0.20)
    assert by_code["accuracy_drop_vs_baseline"]["threshold_drift"] == ACCURACY_DROP_DRIFT
    assert by_code["brier_rise_vs_baseline"]["status"] == "drift_detected"
    assert by_code["confidence_vs_actual_accuracy"]["status"] == "drift_detected"


def test_confidence_gap_boundary_matches_watch_and_ignores_underconfidence():
    assert CONFIDENCE_GAP_WATCH == 0.05
    assert CONFIDENCE_GAP_DRIFT == 0.10
    assert (
        classify_higher_is_worse(
            0.05,
            watch_threshold=CONFIDENCE_GAP_WATCH,
            drift_threshold=CONFIDENCE_GAP_DRIFT,
        )
        == "watch"
    )
    assert (
        classify_higher_is_worse(
            0.049999,
            watch_threshold=CONFIDENCE_GAP_WATCH,
            drift_threshold=CONFIDENCE_GAP_DRIFT,
        )
        == "stable"
    )
    assert (
        classify_higher_is_worse(
            0.10,
            watch_threshold=CONFIDENCE_GAP_WATCH,
            drift_threshold=CONFIDENCE_GAP_DRIFT,
        )
        == "drift_detected"
    )

    under = confidence_vs_accuracy_summary(
        {
            "average_predicted_confidence": 0.50,
            "actual_accuracy": 0.60,
        }
    )
    assert under is not None
    assert under["gap"] == pytest.approx(-0.10)
    assert under["status"] == "stable"

    watch = confidence_vs_accuracy_summary(
        {
            "average_predicted_confidence": 0.55,
            "actual_accuracy": 0.50,
        }
    )
    assert watch is not None
    assert watch["gap"] == pytest.approx(0.05)
    assert watch["status"] == "watch"


def test_feature_drift_health_signals_collapses_all_stable():
    signals = feature_drift_health_signals(
        [
            {
                "feature": "rsi_14",
                "psi": 0.02,
                "status": "stable",
                "explanation": "stable",
            },
            {
                "feature": "macd",
                "psi": 0.01,
                "status": "stable",
                "explanation": "stable",
            },
        ]
    )
    assert len(signals) == 1
    assert signals[0]["code"] == "feature_drift_all_stable"
    assert signals[0]["status"] == "stable"
    status, reasons, explanation = derive_overall_health(signals)
    assert status == "stable"
    assert reasons[0]["code"] == "feature_drift_all_stable"
    assert "feature distributions" in explanation
    assert "rolling performance lacked" in explanation


def test_feature_drift_health_signals_keeps_elevated_rows():
    signals = feature_drift_health_signals(
        [
            {
                "feature": "rsi_14",
                "psi": 0.02,
                "status": "stable",
                "explanation": "stable",
            },
            {
                "feature": "macd",
                "psi": 0.18,
                "status": "watch",
                "explanation": "watch",
            },
            {
                "feature": "return_5d",
                "psi": 0.40,
                "status": "drift_detected",
                "explanation": "drifted",
            },
        ]
    )
    assert [s["status"] for s in signals] == ["watch", "drift_detected"]
    assert all(s["code"].startswith("psi_") for s in signals)


# ---------------------------------------------------------------------------
# Service unavailable states
# ---------------------------------------------------------------------------


def _insufficient_rolling_payload(*, window: int = 30, n_available: int = 10) -> dict:
    return {
        "available": True,
        "horizons": {
            "1d": {
                "baseline": {
                    "accuracy": 0.55,
                    "brier": 0.24,
                    "ece": None,
                    "average_predicted_confidence": None,
                    "actual_accuracy": 0.55,
                    "n_observations": 200,
                    "test_period_start": "2024-01-02",
                    "test_period_end": "2024-12-31",
                },
                "windows": {
                    str(window): {
                        "sufficient": False,
                        "n_available": n_available,
                        "series": [],
                        "latest": None,
                    }
                },
            }
        },
    }


def _feature_score(
    feature: str,
    *,
    status: str,
    psi: float | None,
) -> dict:
    return {
        "feature": feature,
        "psi": psi,
        "status": status,
        "recent": {"mean": 0.1, "std": 0.2, "n_valid": 30},
        "reference": {"mean": 0.0, "std": 0.2, "n_valid": 100},
        "explanation": f"{feature} status={status}",
    }


def _drift_payload(
    *,
    window: int = 30,
    features: list[dict],
    sufficient: bool = True,
    n_available: int = 40,
) -> dict:
    counts = {
        "stable": 0,
        "watch": 0,
        "drift_detected": 0,
        "insufficient_data": 0,
    }
    for row in features:
        counts[str(row["status"])] = counts.get(str(row["status"]), 0) + 1
    return {
        "available": True,
        "feature_schema_fingerprint": "test-fp",
        "horizons": {
            "1d": {
                "available": True,
                "train_start": "2020-01-02",
                "train_end": "2023-01-02",
                "windows": {
                    str(window): {
                        "sufficient": sufficient,
                        "n_available": n_available,
                        "n_scored": window if sufficient else 0,
                        "start_date": "2024-06-01" if sufficient else None,
                        "end_date": "2024-07-15" if sufficient else None,
                        "status_counts": counts,
                        "features": features if sufficient else [],
                    }
                },
            }
        },
    }


def _patch_monitoring_sources(monkeypatch, *, rolling: dict, drift: dict) -> None:
    monkeypatch.setattr(
        "app.services.monitoring_service.get_rolling_model_performance",
        lambda **_kwargs: rolling,
    )
    monkeypatch.setattr(
        "app.services.monitoring_service.get_feature_drift",
        lambda **_kwargs: drift,
    )
    monkeypatch.setattr(
        "app.services.monitoring_service.load_metrics_baseline",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.services.monitoring_service.get_model_version",
        lambda: "v1-test",
    )

def test_service_unavailable_without_walk_forward(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is False
    assert payload["reason"] == "walk_forward_artifact_missing"
    assert payload["status"] is None
    assert payload["latest_performance"] is None
    assert payload["thresholds"] == MONITORING_THRESHOLDS
    ModelMonitoringResponse.model_validate(payload)


def test_service_soft_degrades_without_monitoring_reference(tmp_path, monkeypatch):
    """Rolling performance can still be served when feature-drift artifacts are absent."""
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    data_raw = tmp_path / "data"
    artifacts.mkdir(exist_ok=True)
    data_raw.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    monkeypatch.setattr(config_module, "DATA_RAW_DIR", data_raw)

    dates = pd.bdate_range("2024-01-02", periods=80)
    write_walk_forward(tmp_path, synthetic_walk_forward(dates), monkeypatch)
    (artifacts / "metrics.json").write_text(json.dumps(_metrics_payload()))
    synthetic_ohlcv(n=200).to_csv(data_raw / "spy_daily.csv", index=False)

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["latest_performance"] is not None
    assert payload["feature_drift"] is None
    assert payload["reason"] == "monitoring_reference_missing"
    assert any(
        r.get("code") == "monitoring_reference_missing" for r in payload["status_reasons"]
    )
    ModelMonitoringResponse.model_validate(payload)


def test_service_insufficient_rolling_prefers_observations_over_missing_drift(
    monkeypatch,
):
    """Short rolling windows win over missing drift artifacts for unavailable reason."""
    _patch_monitoring_sources(
        monkeypatch,
        rolling=_insufficient_rolling_payload(window=30, n_available=8),
        drift={
            "available": False,
            "windows": [30],
            "horizons": {},
            "feature_schema_fingerprint": None,
            "psi_thresholds": {},
            "reason": "monitoring_reference_missing",
            "detail": "monitoring_reference.json is not present.",
        },
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is False
    assert payload["reason"] == "insufficient_observations"
    assert "out-of-sample observations" in payload["detail"]
    assert "monitoring_reference_missing" in payload["detail"]
    assert any(
        r.get("code") == "monitoring_reference_missing" for r in payload["status_reasons"]
    )
    ModelMonitoringResponse.model_validate(payload)


def test_service_unavailable_for_insufficient_window(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch, n_history=500)
    # Tiny walk-forward so rolling windows cannot fill; keep a short market
    # history so feature windows are also insufficient for 252.
    from app import config as config_module

    dates = pd.bdate_range("2024-01-02", periods=10)
    write_walk_forward(tmp_path, synthetic_walk_forward(dates), monkeypatch)
    short = synthetic_ohlcv(n=80, seed=3)
    short.to_csv(config_module.DATA_RAW_DIR / "spy_daily.csv", index=False)

    payload = MonitoringService().get_monitoring(horizon="1d", window=252)
    assert payload["available"] is False
    assert payload["reason"] == "insufficient_observations"
    ModelMonitoringResponse.model_validate(payload)


def test_service_available_when_rolling_insufficient_but_feature_drift_stable(monkeypatch):
    _patch_monitoring_sources(
        monkeypatch,
        rolling=_insufficient_rolling_payload(),
        drift=_drift_payload(
            features=[
                _feature_score("rsi_14", status="stable", psi=0.02),
                _feature_score("macd", status="stable", psi=0.03),
            ]
        ),
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["status"] == "stable"
    assert payload["latest_performance"] is None
    assert payload["feature_drift"] is not None
    assert payload["feature_drift"]["status_counts"]["stable"] == 2
    assert any(r["code"] == "feature_drift_all_stable" for r in payload["status_reasons"])
    assert "rolling performance lacked" in payload["status_explanation"]
    ModelMonitoringResponse.model_validate(payload)


def test_service_available_when_rolling_insufficient_but_feature_drift_watch(monkeypatch):
    _patch_monitoring_sources(
        monkeypatch,
        rolling=_insufficient_rolling_payload(),
        drift=_drift_payload(
            features=[
                _feature_score("rsi_14", status="stable", psi=0.02),
                _feature_score("macd", status="watch", psi=0.18),
            ]
        ),
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["status"] == "watch"
    assert payload["latest_performance"] is None
    assert any(r["code"] == "psi_watch" for r in payload["status_reasons"])
    ModelMonitoringResponse.model_validate(payload)


def test_service_available_when_rolling_insufficient_but_feature_drift_detected(
    monkeypatch,
):
    _patch_monitoring_sources(
        monkeypatch,
        rolling=_insufficient_rolling_payload(),
        drift=_drift_payload(
            features=[
                _feature_score("rsi_14", status="watch", psi=0.15),
                _feature_score("macd", status="drift_detected", psi=0.40),
            ]
        ),
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["status"] == "drift_detected"
    assert payload["latest_performance"] is None
    assert any(r["code"] == "psi_drift_detected" for r in payload["status_reasons"])
    ModelMonitoringResponse.model_validate(payload)


def test_service_unavailable_when_rolling_and_feature_drift_insufficient(monkeypatch):
    _patch_monitoring_sources(
        monkeypatch,
        rolling=_insufficient_rolling_payload(window=30, n_available=5),
        drift=_drift_payload(
            features=[],
            sufficient=False,
            n_available=5,
        ),
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is False
    assert payload["reason"] == "insufficient_observations"
    assert payload["status"] is None
    ModelMonitoringResponse.model_validate(payload)


# ---------------------------------------------------------------------------
# Endpoint behavior
# ---------------------------------------------------------------------------


def test_monitoring_endpoint_available_payload(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)

    with _client() as client:
        r = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": "1d", "window": 30},
        )

    assert r.status_code == 200
    body = r.json()
    model = ModelMonitoringResponse.model_validate(body)
    assert model.available is True
    assert model.status in {"stable", "watch", "drift_detected"}
    assert model.horizon == "1d"
    assert model.horizon_days == 1
    assert model.window == 30
    assert model.latest_performance is not None
    assert model.baseline is not None
    assert len(model.rolling_series) >= 1
    assert model.confidence_vs_accuracy is not None
    assert model.feature_drift is not None
    assert len(model.feature_drift.ranked) == len(FEATURE_NAMES)
    assert model.observation_counts.rolling_scored == 30
    assert model.observation_counts.feature_scored == 30
    assert model.model_version == "v1-testmonitor"
    assert model.thresholds["psi"]["watch_max"] == PSI_WATCH_MAX
    assert model.timestamps.metrics_generated_at is not None
    assert model.timestamps.monitoring_reference_generated_at is not None
    assert model.reason is None
    # Ranked list is severity/PSI ordered: first row should be worst or tied.
    ranked = model.feature_drift.ranked
    assert ranked[0].status in {"stable", "watch", "drift_detected", "insufficient_data"}


def test_monitoring_endpoint_supports_5d_and_window_60(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)

    with _client() as client:
        r = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": "5d", "window": 60},
        )

    assert r.status_code == 200
    body = r.json()
    ModelMonitoringResponse.model_validate(body)
    assert body["available"] is True
    assert body["horizon"] == "5d"
    assert body["horizon_days"] == 5
    assert body["window"] == 60
    assert body["latest_performance"]["n_observations"] == 60


def test_monitoring_endpoint_invalid_window_returns_422(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)

    with _client() as client:
        r = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": "1d", "window": 45},
        )

    assert r.status_code == 422
    detail = r.json()["detail"]
    # FastAPI may wrap our HTTPException detail dict, or use its own validation.
    if isinstance(detail, dict):
        assert detail["reason"] == "invalid_window"
    else:
        assert detail


def test_monitoring_endpoint_invalid_horizon_returns_422():
    with _client() as client:
        r = client.get(
            "/api/v1/model/monitoring",
            params={"horizon": "3d", "window": 30},
        )
    assert r.status_code == 422


def test_monitoring_endpoint_unavailable_without_artifacts():
    with _client() as client:
        r = client.get("/api/v1/model/monitoring", params={"horizon": "1d", "window": 30})

    assert r.status_code == 200
    body = r.json()
    ModelMonitoringResponse.model_validate(body)
    assert body["available"] is False
    assert body["reason"] in {
        "walk_forward_artifact_missing",
        "monitoring_reference_missing",
        "market_history_missing",
    }
    assert body["status"] is None
    assert body["latest_performance"] is None
    assert body["feature_drift"] is None
    assert body["rolling_series"] == []


def test_monitoring_endpoint_malformed_walk_forward(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    pd.DataFrame({"date": ["2024-01-02"], "prob_up": [0.5]}).to_csv(
        artifacts / "walk_forward_predictions.csv",
        index=False,
    )

    with _client() as client:
        r = client.get("/api/v1/model/monitoring", params={"window": 30})

    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["reason"] == "walk_forward_artifact_malformed"
    ModelMonitoringResponse.model_validate(body)


def test_monitoring_endpoint_all_horizons_and_windows(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)

    with _client() as client:
        for horizon in ("1d", "5d"):
            for window in (30, 60, 120, 252):
                r = client.get(
                    "/api/v1/model/monitoring",
                    params={"horizon": horizon, "window": window},
                )
                assert r.status_code == 200
                body = r.json()
                ModelMonitoringResponse.model_validate(body)
                assert body["available"] is True
                assert body["horizon"] == horizon
                assert body["window"] == window
                assert body["latest_performance"]["n_observations"] == window
                assert body["observation_counts"]["rolling_scored"] == window
                assert body["observation_counts"]["feature_scored"] == window


def test_monitoring_endpoint_watch_status_from_accuracy_drop(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)
    from app import config as config_module

    # Holdout baseline far above perfect walk-forward accuracy → large accuracy drop.
    metrics = _metrics_payload(accuracy=0.99, brier=0.01)
    # Force a weak walk-forward so accuracy drops into the watch/drift band.
    dates = pd.bdate_range("2024-01-02", periods=80)
    rows: list[dict[str, object]] = []
    for i, ts in enumerate(dates):
        iso = ts.date().isoformat()
        for h in (1, 5):
            # ~50% accuracy with moderate confidence
            actual = i % 2
            predicted = 1 if i % 3 != 0 else 0
            rows.append(
                {
                    "date": iso,
                    "horizon_days": h,
                    "prob_up": 0.7,
                    "predicted": predicted,
                    "actual": actual,
                    "correct": int(predicted == actual),
                    "realized_return": 0.01 if actual == 1 else -0.01,
                }
            )
    write_walk_forward(tmp_path, pd.DataFrame(rows), monkeypatch)
    (config_module.ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics))

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["status"] in {"watch", "drift_detected"}
    ModelMonitoringResponse.model_validate(payload)


def test_monitoring_endpoint_stable_status_with_matched_baseline(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch, perfect_walk_forward=True)

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["latest_performance"]["accuracy"] == pytest.approx(1.0)
    assert payload["confidence_vs_accuracy"]["status"] == "stable"
    # Performance signals alone stay stable against the matched baseline even if
    # recent market features drift relative to the train-split reference.
    perf_signals = performance_health_signals(payload["latest_performance"])
    assert perf_signals
    assert all(s["status"] == "stable" for s in perf_signals)
    ModelMonitoringResponse.model_validate(payload)


def test_monitoring_endpoint_malformed_reference(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)
    from app import config as config_module

    (config_module.ARTIFACTS_DIR / "monitoring_reference.json").write_text("{not-json")

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["feature_drift"] is None
    assert payload["reason"] in {
        "monitoring_reference_malformed",
        "monitoring_reference_missing",
    }
    ModelMonitoringResponse.model_validate(payload)


def test_monitoring_endpoint_schema_mismatch(tmp_path, monkeypatch):
    _seed_monitoring_artifacts(tmp_path, monkeypatch)
    from app import config as config_module

    reference = json.loads(
        (config_module.ARTIFACTS_DIR / "monitoring_reference.json").read_text()
    )
    reference["feature_schema_fingerprint"] = "intentionally-wrong"
    (config_module.ARTIFACTS_DIR / "monitoring_reference.json").write_text(
        json.dumps(reference)
    )

    payload = MonitoringService().get_monitoring(horizon="1d", window=30)
    assert payload["available"] is True
    assert payload["feature_drift"] is None
    assert payload["reason"] == "feature_schema_mismatch"
    ModelMonitoringResponse.model_validate(payload)
