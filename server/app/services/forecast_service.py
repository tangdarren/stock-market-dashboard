"""Load trained models and compute current forecasts with explanations."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from fastapi import Depends
from sklearn.pipeline import Pipeline

from app import config as _config
from app.ml.artifacts import (
    ArtifactError,
    ArtifactMissing,
    LoadedModel,
    load_model,
    read_json,
)
from app.ml.explain import explain_logistic_regression, explain_tree_model, top_factors
from app.ml.features import FEATURE_NAMES, build_features, latest_feature_row
from app.services.market_service import MarketService, get_market_service

logger = logging.getLogger(__name__)


DISCLAIMER = (
    "Model output is probabilistic and may be wrong. It is not financial advice."
)


@dataclass(frozen=True)
class HorizonForecast:
    horizon_days: int
    prob_up: float
    prob_down: float
    direction: str
    confidence: str
    model_name: str
    trained_at: datetime
    features_as_of: str
    explanations: dict[str, list[dict[str, Any]]]


class ForecastService:
    def __init__(self, market_service: MarketService):
        self._market = market_service

    def is_available(self) -> bool:
        for horizon in (1, 5):
            try:
                load_model(horizon)
            except (ArtifactMissing, ArtifactError):
                return False
        return True

    async def forecast(self) -> dict[str, Any]:
        """Return forecasts for 1d and 5d horizons plus metadata + disclaimer."""
        try:
            models = {horizon: load_model(horizon) for horizon in (1, 5)}
        except ArtifactMissing as exc:
            return _unavailable_response(str(exc))
        except ArtifactError as exc:
            logger.exception("Artifact load failed")
            return _unavailable_response(str(exc))

        try:
            market = await self._market.get_spy_daily()
        except Exception as exc:
            logger.warning("Market data unavailable during forecast: %s", exc)
            return _unavailable_response(f"Market data unavailable: {exc}")

        frame = pd.DataFrame(market["series"])
        frame["date"] = pd.to_datetime(frame["date"])
        features_df = build_features(frame)

        try:
            current = latest_feature_row(features_df)
        except ValueError as exc:
            return _unavailable_response(str(exc))

        features_as_of = market["features_as_of"]

        forecasts: dict[str, dict[str, Any]] = {}
        for horizon, loaded in models.items():
            forecasts[f"{horizon}d"] = self._forecast_one(loaded, current, features_as_of)

        return {
            "one_day": forecasts["1d"],
            "five_day": forecasts["5d"],
            "features_as_of": features_as_of,
            "data_as_of": market["data_as_of"],
            "mode": market["mode"],
            "is_stale": market.get("is_stale", False),
            "disclaimer": DISCLAIMER,
            "model_unavailable": False,
        }

    def _forecast_one(
        self,
        loaded: LoadedModel,
        current: pd.Series,
        features_as_of: str,
    ) -> dict[str, Any]:
        x = current.reindex(FEATURE_NAMES).to_numpy(dtype=float).reshape(1, -1)
        prob_up = float(loaded.pipeline.predict_proba(x)[0, 1])
        prob_up = float(np.clip(prob_up, 0.0, 1.0))
        prob_down = 1.0 - prob_up
        direction = "up" if prob_up >= 0.5 else "down"
        confidence = _confidence_label(prob_up)

        explanations = _build_explanations(loaded, current)

        return {
            "horizon_days": loaded.horizon,
            "prob_up": prob_up,
            "prob_down": prob_down,
            "direction": direction,
            "confidence": confidence,
            "model_name": loaded.model_name,
            "trained_at": loaded.trained_at.isoformat(),
            "features_as_of": features_as_of,
            "explanations": explanations,
        }


def _confidence_label(prob_up: float) -> str:
    confidence = max(prob_up, 1 - prob_up)
    if confidence >= 0.65:
        return "high"
    if confidence >= 0.55:
        return "moderate"
    return "low"


def _build_explanations(loaded: LoadedModel, current: pd.Series) -> dict[str, list[dict[str, Any]]]:
    pipeline = loaded.pipeline
    if isinstance(pipeline, Pipeline) and "clf" in pipeline.named_steps:
        clf = pipeline.named_steps["clf"]
        if clf.__class__.__name__ == "LogisticRegression":
            factors = explain_logistic_regression(pipeline, current)
            grouped = top_factors(factors)
            return {
                "method": "logistic_regression_contribution",
                "up": grouped["up"],
                "down": grouped["down"],
                "uncertainty": grouped["uncertainty"],
            }

    perm_importance = loaded.training_metadata.get("permutation_importance") or {}
    medians = loaded.training_metadata.get("training_medians") or {}
    factors = explain_tree_model(perm_importance, current, medians)
    grouped = top_factors(factors)
    return {
        "method": "permutation_importance_x_context",
        "up": grouped["up"],
        "down": grouped["down"],
        "uncertainty": grouped["uncertainty"],
    }


def _unavailable_response(reason: str) -> dict[str, Any]:
    return {
        "one_day": None,
        "five_day": None,
        "features_as_of": None,
        "data_as_of": None,
        "mode": "model_unavailable",
        "is_stale": False,
        "disclaimer": DISCLAIMER,
        "model_unavailable": True,
        "reason": reason,
    }


def get_forecast_service(
    market_service: MarketService = Depends(get_market_service),
) -> ForecastService:
    return ForecastService(market_service)


def get_metrics_payload() -> dict[str, Any] | None:
    """Read cached metrics JSON from disk. ``None`` if unavailable."""
    try:
        return read_json("metrics.json")
    except ArtifactMissing:
        return None


def get_walk_forward_records(limit: int | None = 30) -> list[dict[str, Any]]:
    path = _config.ARTIFACTS_DIR / "walk_forward_predictions.csv"
    if not path.exists():
        return []
    df = pd.read_csv(path)
    df = df.sort_values("date", ascending=False)
    if limit is not None:
        df = df.head(limit)
    df = df.sort_values("date")
    return df.to_dict(orient="records")


def get_model_version() -> str | None:
    path = _config.ARTIFACTS_DIR / "model_version.txt"
    if not path.exists():
        return None
    return path.read_text().strip()
