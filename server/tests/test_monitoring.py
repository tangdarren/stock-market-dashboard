"""Unit tests for rolling model performance monitoring."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import accuracy_score, brier_score_loss

from app.ml.evaluate import average_predicted_confidence, expected_calibration_error
from app.ml.monitoring import (
    DEFAULT_WINDOWS,
    compute_rolling_model_performance,
    extract_holdout_baseline,
    get_rolling_model_performance,
    load_walk_forward_predictions,
    rolling_performance_for_horizon,
    window_performance_metrics,
)
from app.ml.schemas import RollingModelPerformanceResponse
from tests.replay_fixtures import synthetic_walk_forward, write_walk_forward


def _dates(n: int, start: str = "2024-01-02") -> pd.DatetimeIndex:
    return pd.bdate_range(start=start, periods=n)


def _perfect_frame(n: int = 80) -> pd.DataFrame:
    """Walk-forward rows where predictions always match actuals at high confidence."""
    dates = _dates(n)
    rows: list[dict[str, object]] = []
    for i, ts in enumerate(dates):
        iso = ts.date().isoformat()
        for h in (1, 5):
            actual = i % 2
            prob_up = 0.9 if actual == 1 else 0.1
            rows.append(
                {
                    "date": iso,
                    "horizon_days": h,
                    "prob_up": prob_up,
                    "predicted": actual,
                    "actual": actual,
                    "correct": 1,
                    "realized_return": 0.01 if actual == 1 else -0.01,
                }
            )
    return pd.DataFrame(rows)


def _metrics_payload(*, accuracy_1d: float = 0.5, brier_1d: float = 0.25) -> dict:
    return {
        "horizons": {
            "1d": {
                "holdout": {
                    "accuracy": accuracy_1d,
                    "brier": brier_1d,
                    "n_observations": 100,
                    "test_period_start": "2023-01-01",
                    "test_period_end": "2023-12-31",
                }
            },
            "5d": {
                "holdout": {
                    "accuracy": 0.55,
                    "brier": 0.24,
                    "n_observations": 100,
                    "test_period_start": "2023-01-01",
                    "test_period_end": "2023-12-31",
                }
            },
        }
    }


# ---------------------------------------------------------------------------
# Metric primitives
# ---------------------------------------------------------------------------


def test_expected_calibration_error_perfectly_calibrated():
    y = np.array([0, 0, 1, 1])
    p = np.array([0.0, 0.0, 1.0, 1.0])
    assert expected_calibration_error(y, p, bins=2) == pytest.approx(0.0)


def test_expected_calibration_error_empty_is_none():
    assert expected_calibration_error(np.array([]), np.array([])) is None


def test_average_predicted_confidence():
    assert average_predicted_confidence(np.array([0.8, 0.2])) == pytest.approx(0.8)
    assert average_predicted_confidence(np.array([])) is None


def test_window_performance_metrics_matches_sklearn():
    y = np.array([0, 1, 1, 0, 1])
    pred = np.array([0, 1, 0, 0, 1])
    prob = np.array([0.2, 0.7, 0.4, 0.3, 0.9])
    dates = pd.Series(pd.bdate_range("2024-01-02", periods=5))
    baseline = {
        "accuracy": 0.5,
        "brier": 0.25,
        "ece": None,
        "average_predicted_confidence": None,
        "actual_accuracy": 0.5,
    }

    result = window_performance_metrics(y, pred, prob, dates, baseline=baseline)

    assert result["n_observations"] == 5
    assert result["start_date"] == "2024-01-02"
    assert result["end_date"] == dates.iloc[-1].date().isoformat()
    assert result["accuracy"] == pytest.approx(float(accuracy_score(y, pred)))
    assert result["actual_accuracy"] == pytest.approx(result["accuracy"])
    assert result["brier"] == pytest.approx(float(brier_score_loss(y, prob)))
    assert result["ece"] == pytest.approx(expected_calibration_error(y, prob))
    assert result["average_predicted_confidence"] == pytest.approx(
        average_predicted_confidence(prob)
    )
    assert result["vs_baseline"]["accuracy"] == pytest.approx(result["accuracy"] - 0.5)
    assert result["vs_baseline"]["brier"] == pytest.approx(result["brier"] - 0.25)
    assert result["vs_baseline"]["ece"] is None
    assert result["vs_baseline"]["average_predicted_confidence"] is None


# ---------------------------------------------------------------------------
# Rolling series
# ---------------------------------------------------------------------------


def test_rolling_series_is_chronological_and_window_sized():
    frame = _perfect_frame(n=50)
    result = rolling_performance_for_horizon(
        frame,
        horizon_days=1,
        window=30,
        baseline=extract_holdout_baseline(_metrics_payload(), 1),
    )

    assert result["sufficient"] is True
    assert result["n_available"] == 50
    assert len(result["series"]) == 21  # 50 - 30 + 1
    assert result["latest"] is not None
    assert result["latest"] == result["series"][-1]

    for point in result["series"]:
        assert point["n_observations"] == 30
        assert point["accuracy"] == pytest.approx(1.0)
        assert point["actual_accuracy"] == pytest.approx(1.0)
        assert point["average_predicted_confidence"] == pytest.approx(0.9)

    starts = [p["start_date"] for p in result["series"]]
    ends = [p["end_date"] for p in result["series"]]
    assert starts == sorted(starts)
    assert ends == sorted(ends)
    assert ends[-1] == frame.loc[frame["horizon_days"] == 1, "date"].iloc[-1]


def test_horizons_are_computed_separately():
    dates = _dates(40)
    rows: list[dict[str, object]] = []
    for ts in dates:
        iso = ts.date().isoformat()
        # 1d always correct; 5d always wrong.
        rows.append(
            {
                "date": iso,
                "horizon_days": 1,
                "prob_up": 0.8,
                "predicted": 1,
                "actual": 1,
                "correct": 1,
                "realized_return": 0.01,
            }
        )
        rows.append(
            {
                "date": iso,
                "horizon_days": 5,
                "prob_up": 0.8,
                "predicted": 1,
                "actual": 0,
                "correct": 0,
                "realized_return": -0.01,
            }
        )
    frame = pd.DataFrame(rows)
    payload = compute_rolling_model_performance(
        frame, _metrics_payload(), windows=(30,), horizons=(1, 5)
    )

    assert payload["available"] is True
    assert payload["horizons"]["1d"]["windows"]["30"]["latest"]["accuracy"] == pytest.approx(1.0)
    assert payload["horizons"]["5d"]["windows"]["30"]["latest"]["accuracy"] == pytest.approx(0.0)


def test_insufficient_observations_returns_empty_series():
    frame = synthetic_walk_forward(_dates(20))
    result = rolling_performance_for_horizon(frame, horizon_days=1, window=30)
    assert result["sufficient"] is False
    assert result["n_available"] == 20
    assert result["series"] == []
    assert result["latest"] is None


def test_missing_values_are_dropped_before_rolling():
    frame = _perfect_frame(n=40)
    # Corrupt half of the 1d rows so only 20 complete 1d observations remain.
    mask = frame["horizon_days"] == 1
    idxs = frame.index[mask][:20]
    frame.loc[idxs, "actual"] = np.nan
    result = rolling_performance_for_horizon(frame, horizon_days=1, window=30)
    assert result["sufficient"] is False
    assert result["n_available"] == 20


def test_default_windows_present_in_payload():
    frame = _perfect_frame(n=260)
    payload = compute_rolling_model_performance(frame, _metrics_payload())
    assert payload["windows"] == list(DEFAULT_WINDOWS)
    for horizon in ("1d", "5d"):
        assert set(payload["horizons"][horizon]["windows"]) == {
            str(w) for w in DEFAULT_WINDOWS
        }
        assert payload["horizons"][horizon]["windows"]["252"]["sufficient"] is True
        assert payload["horizons"][horizon]["baseline"]["accuracy"] is not None


def test_baseline_deltas_use_metrics_json_holdout():
    frame = _perfect_frame(n=40)
    metrics = _metrics_payload(accuracy_1d=0.4, brier_1d=0.3)
    payload = compute_rolling_model_performance(frame, metrics, windows=(30,))
    latest = payload["horizons"]["1d"]["windows"]["30"]["latest"]
    assert latest["vs_baseline"]["accuracy"] == pytest.approx(1.0 - 0.4)
    assert latest["vs_baseline"]["actual_accuracy"] == pytest.approx(1.0 - 0.4)
    assert latest["vs_baseline"]["brier"] == pytest.approx(latest["brier"] - 0.3)


def test_missing_metrics_still_returns_series_with_null_deltas():
    frame = _perfect_frame(n=40)
    payload = compute_rolling_model_performance(frame, None, windows=(30,))
    assert payload["available"] is True
    assert payload["baseline_available"] is False
    assert payload["reason"] == "metrics_artifact_missing"
    latest = payload["horizons"]["1d"]["windows"]["30"]["latest"]
    assert latest["accuracy"] == pytest.approx(1.0)
    assert latest["vs_baseline"]["accuracy"] is None
    assert latest["vs_baseline"]["brier"] is None


def test_response_validates_against_schema():
    frame = _perfect_frame(n=40)
    payload = compute_rolling_model_performance(frame, _metrics_payload(), windows=(30,))
    model = RollingModelPerformanceResponse.model_validate(payload)
    assert model.available is True
    assert model.horizons["1d"].windows["30"].latest is not None


# ---------------------------------------------------------------------------
# Artifact loading edge cases
# ---------------------------------------------------------------------------


def test_get_rolling_model_performance_missing_walk_forward(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)

    payload = get_rolling_model_performance(windows=(30,))
    assert payload["available"] is False
    assert payload["reason"] == "walk_forward_artifact_missing"
    assert "walk_forward" in payload["detail"]


def test_get_rolling_model_performance_malformed_columns(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    pd.DataFrame({"date": ["2024-01-02"], "prob_up": [0.5]}).to_csv(
        artifacts / "walk_forward_predictions.csv", index=False
    )

    payload = get_rolling_model_performance(windows=(30,))
    assert payload["available"] is False
    assert payload["reason"] == "walk_forward_artifact_malformed"


def test_load_walk_forward_rejects_non_numeric_prob(tmp_path, monkeypatch):
    from app import config as config_module

    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(exist_ok=True)
    monkeypatch.setattr(config_module, "ARTIFACTS_DIR", artifacts)
    bad = synthetic_walk_forward(_dates(5))
    bad["prob_up"] = "not-a-number"
    bad.to_csv(artifacts / "walk_forward_predictions.csv", index=False)

    with pytest.raises(Exception) as excinfo:
        load_walk_forward_predictions()
    assert getattr(excinfo.value, "reason", None) == "walk_forward_artifact_malformed"


def test_get_rolling_model_performance_with_artifacts(tmp_path, monkeypatch):
    frame = _perfect_frame(n=40)
    write_walk_forward(tmp_path, frame, monkeypatch)
    artifacts = tmp_path / "artifacts"
    (artifacts / "metrics.json").write_text(json.dumps(_metrics_payload()))

    payload = get_rolling_model_performance(windows=(30,))
    assert payload["available"] is True
    assert payload["baseline_available"] is True
    assert payload["horizons"]["1d"]["windows"]["30"]["latest"]["accuracy"] == pytest.approx(
        1.0
    )
    assert payload["horizons"]["5d"]["windows"]["30"]["latest"]["accuracy"] == pytest.approx(
        1.0
    )
