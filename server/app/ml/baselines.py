"""Non-ML baselines used as sanity checks for the classification task."""

from __future__ import annotations

import numpy as np
import pandas as pd


class MajorityClassBaseline:
    """Always predicts the training-set majority class."""

    def __init__(self):
        self.class_: int | None = None
        self.prob_: float = 0.5

    def fit(self, X: np.ndarray, y: np.ndarray) -> MajorityClassBaseline:
        y = np.asarray(y)
        counts = np.bincount(y.astype(int), minlength=2)
        self.class_ = int(np.argmax(counts))
        self.prob_ = float(counts[1] / max(1, counts.sum()))
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.class_ is None:
            raise RuntimeError("Baseline not fit yet.")
        return np.full(len(X), self.class_, dtype=int)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p = self.prob_
        return np.column_stack([np.full(len(X), 1 - p), np.full(len(X), p)])


class PersistenceBaseline:
    """Predicts that tomorrow's direction equals today's realized direction.

    Uses the raw last daily return of each row's feature block (which is a lagged
    return so it does not peek at the future).
    """

    def __init__(self, feature_name: str = "return_1d_lag"):
        self.feature_name = feature_name
        self._feature_idx: int | None = None
        self._feature_names: list[str] | None = None

    def fit(self, X, y, feature_names: list[str] | None = None) -> PersistenceBaseline:  # noqa: ARG002
        if feature_names is not None:
            self._feature_names = list(feature_names)
            if self.feature_name in self._feature_names:
                self._feature_idx = self._feature_names.index(self.feature_name)
        return self

    def _extract(self, X) -> np.ndarray:
        if isinstance(X, pd.DataFrame):
            if self.feature_name in X.columns:
                return X[self.feature_name].to_numpy()
            if self._feature_idx is not None:
                return X.iloc[:, self._feature_idx].to_numpy()
            raise ValueError("PersistenceBaseline: feature column not found.")
        arr = np.asarray(X)
        if self._feature_idx is None:
            raise ValueError(
                "PersistenceBaseline: numpy input requires feature_names at fit time."
            )
        return arr[:, self._feature_idx]

    def predict(self, X) -> np.ndarray:
        return (self._extract(X) > 0).astype(int)

    def predict_proba(self, X) -> np.ndarray:
        up = self._extract(X) > 0
        p = np.where(up, 0.55, 0.45)
        return np.column_stack([1 - p, p])
