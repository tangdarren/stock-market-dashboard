"""Metrics computed from holdout predictions."""

from __future__ import annotations

from collections import Counter
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def safe_roc_auc(y_true: np.ndarray, prob_up: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    try:
        return float(roc_auc_score(y_true, prob_up))
    except ValueError:
        return None


def holdout_metrics(
    y_true: np.ndarray,
    predictions: np.ndarray,
    prob_up: np.ndarray,
    dates: pd.Series,
) -> dict[str, Any]:
    y_true = np.asarray(y_true).astype(int)
    predictions = np.asarray(predictions).astype(int)
    prob_up = np.asarray(prob_up).astype(float)
    class_counter = Counter(y_true.tolist())

    return {
        "n_observations": int(len(y_true)),
        "test_period_start": str(pd.to_datetime(dates.iloc[0]).date()),
        "test_period_end": str(pd.to_datetime(dates.iloc[-1]).date()),
        "class_distribution": {
            "class_0": int(class_counter.get(0, 0)),
            "class_1": int(class_counter.get(1, 0)),
        },
        "accuracy": float(accuracy_score(y_true, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predictions)),
        "precision_up": float(precision_score(y_true, predictions, pos_label=1, zero_division=0)),
        "recall_up": float(recall_score(y_true, predictions, pos_label=1, zero_division=0)),
        "f1_up": float(f1_score(y_true, predictions, pos_label=1, zero_division=0)),
        "brier": float(brier_score_loss(y_true, prob_up)),
        "roc_auc": safe_roc_auc(y_true, prob_up),
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=[0, 1]).tolist(),
    }


def yearly_breakdown(
    y_true: np.ndarray,
    predictions: np.ndarray,
    prob_up: np.ndarray,
    dates: pd.Series,
) -> list[dict[str, Any]]:
    dates_ts = pd.to_datetime(dates).reset_index(drop=True)
    df = pd.DataFrame(
        {
            "year": dates_ts.dt.year.astype(int),
            "y": np.asarray(y_true).astype(int),
            "pred": np.asarray(predictions).astype(int),
            "prob": np.asarray(prob_up).astype(float),
        }
    )
    rows: list[dict[str, Any]] = []
    for year, group in df.groupby("year"):
        rows.append(
            {
                "year": int(year),
                "n": int(len(group)),
                "accuracy": float(accuracy_score(group["y"], group["pred"])),
                "balanced_accuracy": float(balanced_accuracy_score(group["y"], group["pred"])),
                "roc_auc": safe_roc_auc(group["y"].to_numpy(), group["prob"].to_numpy()),
            }
        )
    return rows


def confidence_bucket_breakdown(
    y_true: np.ndarray, prob_up: np.ndarray, thresholds: tuple[float, ...] = (0.55, 0.65)
) -> list[dict[str, Any]]:
    y_true = np.asarray(y_true).astype(int)
    prob_up = np.asarray(prob_up).astype(float)
    confidence = np.where(prob_up >= 0.5, prob_up, 1 - prob_up)

    bounds = [0.0, *thresholds, 1.0]
    labels = ["low", "moderate", "high"][: len(bounds) - 1]

    rows: list[dict[str, Any]] = []
    for i in range(len(bounds) - 1):
        lo, hi = bounds[i], bounds[i + 1]
        mask = (confidence >= lo) & (confidence < hi if i < len(bounds) - 2 else confidence <= hi)
        if not mask.any():
            rows.append(
                {
                    "bucket": labels[i],
                    "confidence_range": [lo, hi],
                    "n": 0,
                    "accuracy": None,
                }
            )
            continue
        preds = (prob_up[mask] >= 0.5).astype(int)
        rows.append(
            {
                "bucket": labels[i],
                "confidence_range": [lo, hi],
                "n": int(mask.sum()),
                "accuracy": float((preds == y_true[mask]).mean()),
            }
        )
    return rows


def calibration_curve_points(
    y_true: np.ndarray, prob_up: np.ndarray, *, bins: int = 10
) -> list[dict[str, float]]:
    y_true = np.asarray(y_true).astype(int)
    prob_up = np.asarray(prob_up).astype(float)
    bin_edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.searchsorted(bin_edges, prob_up, side="right") - 1, 0, bins - 1)
    rows: list[dict[str, float]] = []
    for b in range(bins):
        mask = idx == b
        if not mask.any():
            continue
        rows.append(
            {
                "bin_center": float((bin_edges[b] + bin_edges[b + 1]) / 2),
                "predicted_prob": float(prob_up[mask].mean()),
                "empirical_prob": float(y_true[mask].mean()),
                "n": int(mask.sum()),
            }
        )
    return rows
