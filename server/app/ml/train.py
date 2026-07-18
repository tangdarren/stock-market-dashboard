"""Model selection and holdout evaluation.

The public entrypoint is :func:`train_all_horizons`, which:

1. Builds features + targets.
2. Reserves the chronological tail as an untouched holdout.
3. Runs ``TimeSeriesSplit`` cross-validation on the training segment for each
   model, ranks them by mean ROC-AUC (tiebreak: Brier), and picks the winner.
4. Refits the winner on the full training segment.
5. Produces holdout metrics, walk-forward records, calibration data, and a
   backtest.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance

from app.ml.backtest import educational_backtest
from app.ml.baselines import MajorityClassBaseline, PersistenceBaseline
from app.ml.evaluate import (
    calibration_curve_points,
    confidence_bucket_breakdown,
    holdout_metrics,
    safe_roc_auc,
    yearly_breakdown,
)
from app.ml.features import FEATURE_NAMES, build_features
from app.ml.models import ModelSpec, model_catalog
from app.ml.targets import add_targets, training_frame
from app.ml.validation import chronological_holdout, make_time_series_cv


@dataclass
class HorizonTrainingResult:
    horizon: int
    selected_model_name: str
    pipeline: Any
    feature_names: list[str]
    holdout_metrics: dict[str, Any]
    model_comparison: list[dict[str, Any]]
    baselines: dict[str, dict[str, Any]]
    yearly_metrics: list[dict[str, Any]]
    confidence_buckets: list[dict[str, Any]]
    calibration: list[dict[str, float]]
    walk_forward: pd.DataFrame
    permutation_importance: dict[str, float]
    training_medians: dict[str, float]
    backtest: dict[str, Any]
    training_metadata: dict[str, Any]


def prepare_dataset(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """Attach features + targets and drop rows with any NaN in the features."""
    with_features = build_features(ohlcv)
    with_targets = add_targets(with_features)
    complete = with_targets.dropna(subset=list(FEATURE_NAMES)).reset_index(drop=True)
    return complete


def train_horizon(
    dataset: pd.DataFrame,
    *,
    horizon: int,
    n_cv_splits: int = 5,
) -> HorizonTrainingResult:
    trainable = training_frame(dataset, horizon=horizon)
    if len(trainable) < 200:
        raise ValueError(
            f"Not enough training rows for horizon={horizon}d: {len(trainable)}"
        )

    split = chronological_holdout(trainable)
    train = trainable.iloc[split.train_idx]
    holdout = trainable.iloc[split.holdout_idx]

    X_train = train[list(FEATURE_NAMES)].to_numpy(dtype=float)
    y_train = train[f"target_{horizon}d"].to_numpy(dtype=int)
    X_hold = holdout[list(FEATURE_NAMES)].to_numpy(dtype=float)
    y_hold = holdout[f"target_{horizon}d"].to_numpy(dtype=int)

    cv = make_time_series_cv(n_splits=n_cv_splits)
    comparison: list[dict[str, Any]] = []
    for spec in model_catalog():
        cv_scores = _cross_validate_model(spec, X_train, y_train, cv)
        comparison.append(
            {
                "model_name": spec.name,
                "mean_val_roc_auc": _mean_or_none(cv_scores["roc_auc"]),
                "mean_val_brier": _mean_or_none(cv_scores["brier"]),
                "mean_val_accuracy": _mean_or_none(cv_scores["accuracy"]),
                "fold_roc_auc": cv_scores["roc_auc"],
            }
        )

    ranked = sorted(
        comparison,
        key=lambda row: (
            -(row["mean_val_roc_auc"] if row["mean_val_roc_auc"] is not None else -1),
            (row["mean_val_brier"] if row["mean_val_brier"] is not None else 1),
        ),
    )
    winner_row = ranked[0]
    winner_row["selected"] = True
    winner_spec = next(s for s in model_catalog() if s.name == winner_row["model_name"])

    pipeline = winner_spec.build()
    pipeline.fit(X_train, y_train)

    prob_hold = pipeline.predict_proba(X_hold)[:, 1]
    pred_hold = (prob_hold >= 0.5).astype(int)
    hold_metrics = holdout_metrics(y_hold, pred_hold, prob_hold, holdout["date"])
    hold_year_metrics = yearly_breakdown(y_hold, pred_hold, prob_hold, holdout["date"])
    hold_bucket_metrics = confidence_bucket_breakdown(y_hold, prob_hold)
    hold_calibration = calibration_curve_points(y_hold, prob_hold)

    baselines_metrics = _score_baselines(
        X_train=X_train,
        y_train=y_train,
        X_hold=X_hold,
        y_hold=y_hold,
        hold_dates=holdout["date"],
        train_df=train,
        holdout_df=holdout,
    )

    walk_forward = pd.DataFrame(
        {
            "date": pd.to_datetime(holdout["date"].values).strftime("%Y-%m-%d"),
            "horizon_days": horizon,
            "prob_up": prob_hold,
            "predicted": pred_hold,
            "actual": y_hold,
            "correct": (pred_hold == y_hold).astype(int),
            "realized_return": holdout[f"realized_future_return_{horizon}d"].to_numpy(dtype=float),
        }
    )

    perm_importance = _permutation_importance(pipeline, X_hold, y_hold)
    training_medians = {
        name: float(train[name].median()) for name in FEATURE_NAMES
    }

    if horizon == 1:
        backtest_result = educational_backtest(
            dates=holdout["date"],
            realized_returns=holdout[f"realized_future_return_{horizon}d"].to_numpy(dtype=float),
            prob_up=prob_hold,
        )
    else:
        backtest_result = {"available": False, "reason": "not_applicable_for_horizon"}

    training_metadata = {
        "horizon_days": horizon,
        "model_name": winner_spec.name,
        "features": list(FEATURE_NAMES),
        "n_train": int(len(y_train)),
        "n_holdout": int(len(y_hold)),
        "train_start": str(split.train_start.date()),
        "train_end": str(split.train_end.date()),
        "holdout_start": str(split.holdout_start.date()),
        "holdout_end": str(split.holdout_end.date()),
        "trained_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "cv_splits": n_cv_splits,
        "training_medians": training_medians,
        "permutation_importance": perm_importance,
        "adjustment": "unadjusted",
    }

    return HorizonTrainingResult(
        horizon=horizon,
        selected_model_name=winner_spec.name,
        pipeline=pipeline,
        feature_names=list(FEATURE_NAMES),
        holdout_metrics=hold_metrics,
        model_comparison=comparison,
        baselines=baselines_metrics,
        yearly_metrics=hold_year_metrics,
        confidence_buckets=hold_bucket_metrics,
        calibration=hold_calibration,
        walk_forward=walk_forward,
        permutation_importance=perm_importance,
        training_medians=training_medians,
        backtest=backtest_result,
        training_metadata=training_metadata,
    )


def train_all_horizons(
    ohlcv: pd.DataFrame, *, n_cv_splits: int = 5
) -> dict[int, HorizonTrainingResult]:
    dataset = prepare_dataset(ohlcv)
    results: dict[int, HorizonTrainingResult] = {}
    for horizon in (1, 5):
        results[horizon] = train_horizon(dataset, horizon=horizon, n_cv_splits=n_cv_splits)
    return results


def _cross_validate_model(
    spec: ModelSpec,
    X: np.ndarray,
    y: np.ndarray,
    cv,
) -> dict[str, list[float | None]]:
    roc_scores: list[float | None] = []
    brier_scores: list[float] = []
    acc_scores: list[float] = []
    for train_idx, val_idx in cv.split(X):
        model = spec.build()
        model.fit(X[train_idx], y[train_idx])
        prob = model.predict_proba(X[val_idx])[:, 1]
        pred = (prob >= 0.5).astype(int)
        roc_scores.append(safe_roc_auc(y[val_idx], prob))
        brier_scores.append(float(np.mean((prob - y[val_idx]) ** 2)))
        acc_scores.append(float(np.mean(pred == y[val_idx])))
    return {
        "roc_auc": roc_scores,
        "brier": brier_scores,
        "accuracy": acc_scores,
    }


def _score_baselines(
    *,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_hold: np.ndarray,
    y_hold: np.ndarray,
    hold_dates: pd.Series,
    train_df: pd.DataFrame,
    holdout_df: pd.DataFrame,
) -> dict[str, dict[str, Any]]:
    majority = MajorityClassBaseline().fit(X_train, y_train)
    persistence = PersistenceBaseline().fit(
        train_df[list(FEATURE_NAMES)], y_train, feature_names=list(FEATURE_NAMES)
    )

    maj_prob = majority.predict_proba(X_hold)[:, 1]
    maj_pred = majority.predict(X_hold)
    per_prob = persistence.predict_proba(holdout_df[list(FEATURE_NAMES)])[:, 1]
    per_pred = persistence.predict(holdout_df[list(FEATURE_NAMES)])

    return {
        "majority_class": holdout_metrics(y_hold, maj_pred, maj_prob, hold_dates),
        "persistence": holdout_metrics(y_hold, per_pred, per_prob, hold_dates),
    }


def _permutation_importance(pipeline, X_hold: np.ndarray, y_hold: np.ndarray) -> dict[str, float]:
    if len(y_hold) < 30:
        return {}
    try:
        result = permutation_importance(
            pipeline, X_hold, y_hold, n_repeats=5, random_state=42, n_jobs=-1
        )
    except Exception:
        return {}
    return {name: float(imp) for name, imp in zip(FEATURE_NAMES, result.importances_mean, strict=True)}


def _mean_or_none(values: list[float | None]) -> float | None:
    numeric = [v for v in values if v is not None]
    if not numeric:
        return None
    return float(np.mean(numeric))
