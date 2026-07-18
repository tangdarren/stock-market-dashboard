"""Model factories for the SPY direction task."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


@dataclass(frozen=True)
class ModelSpec:
    name: str
    build: Callable[[], Any]


def logistic_regression_pipeline() -> Pipeline:
    return Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    max_iter=500,
                    solver="liblinear",
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )


def random_forest() -> RandomForestClassifier:
    return RandomForestClassifier(
        n_estimators=400,
        max_depth=8,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )


def hist_gradient_boosting() -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_depth=None,
        max_leaf_nodes=31,
        early_stopping=False,
        random_state=42,
    )


def model_catalog() -> list[ModelSpec]:
    return [
        ModelSpec("logistic_regression", logistic_regression_pipeline),
        ModelSpec("random_forest", random_forest),
        ModelSpec("hist_gradient_boosting", hist_gradient_boosting),
    ]
