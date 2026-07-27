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

SIMULATED_FORECAST_DISCLAIMER = (
    "These outlooks are synthetic scenario fixtures from the local workbook. "
    "They are not outputs from a trained live model and must not be treated as "
    "real SPY forecasts."
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

    async def forecast(self, *, simulated: bool = False) -> dict[str, Any]:
        """Return forecasts for 1d and 5d horizons plus metadata + disclaimer.

        Simulated mode returns workbook-backed Current_Forecast fixtures and does
        not require trained model artifacts. Live mode keeps the existing Alpha
        Vantage + artifact inference path.
        """
        if simulated:
            return await self._forecast_simulated()
        return await self._forecast_live()

    async def _forecast_simulated(self) -> dict[str, Any]:
        from app.ml.simulated import (
            SIMULATED_DATA_DISCLAIMER,
            SimulatedDataError,
            get_simulated_workbook,
        )

        try:
            workbook = get_simulated_workbook()
        except SimulatedDataError as exc:
            return _simulated_forecast_unavailable(exc.reason, str(exc))

        if workbook.current_forecast_error is not None or not workbook.current_forecasts:
            err = workbook.current_forecast_error
            reason = (
                err.reason if err is not None else "simulated_current_forecast_missing"
            )
            message = (
                err.message
                if err is not None
                else "Simulated Current_Forecast data is unavailable."
            )
            return _simulated_forecast_unavailable(reason, message)

        one_day = workbook.current_forecast_by_horizon(1)
        five_day = workbook.current_forecast_by_horizon(5)
        if one_day is None or five_day is None:
            return _simulated_forecast_unavailable(
                "simulated_current_forecast_malformed",
                "Simulated Current_Forecast must include both 1-day and 5-day rows.",
            )

        features_as_of = one_day.features_as_of
        latest_market = workbook.market_data["date"].iloc[-1].date().isoformat()
        if features_as_of != latest_market or five_day.features_as_of != latest_market:
            return _simulated_forecast_unavailable(
                "simulated_current_forecast_inconsistent",
                (
                    "Simulated Current_Forecast features_as_of must match the latest "
                    f"Market_Data session ({latest_market})."
                ),
            )

        disclaimer = workbook.scenario.warning or SIMULATED_DATA_DISCLAIMER
        return {
            "one_day": one_day.to_horizon_payload(),
            "five_day": five_day.to_horizon_payload(),
            "features_as_of": features_as_of,
            "data_as_of": latest_market,
            "mode": "simulated",
            "is_stale": False,
            "disclaimer": SIMULATED_FORECAST_DISCLAIMER,
            "model_unavailable": False,
            "source": "simulated_workbook",
            "data_classification": workbook.scenario.data_classification,
            "simulated_disclaimer": disclaimer,
            "scenario_name": workbook.scenario.scenario_name,
        }

    async def _forecast_live(self) -> dict[str, Any]:
        try:
            models = {horizon: load_model(horizon) for horizon in (1, 5)}
        except ArtifactMissing as exc:
            return _unavailable_response(str(exc))
        except ArtifactError as exc:
            logger.exception("Artifact load failed")
            return _unavailable_response(str(exc))

        try:
            market = await self._market.get_spy_daily(simulated=False)
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


def _simulated_forecast_unavailable(reason: str, message: str) -> dict[str, Any]:
    """Workbook-backed forecast failure — never claim trained artifacts are missing."""
    return {
        "one_day": None,
        "five_day": None,
        "features_as_of": None,
        "data_as_of": None,
        "mode": "simulated",
        "is_stale": False,
        "disclaimer": SIMULATED_FORECAST_DISCLAIMER,
        "model_unavailable": False,
        "reason": reason,
        "detail": message,
        "source": "simulated_workbook",
        "data_classification": "SIMULATED / FICTIONAL",
    }


def get_forecast_service(
    market_service: MarketService = Depends(get_market_service),
) -> ForecastService:
    return ForecastService(market_service)


def get_metrics_payload(*, simulated: bool = False) -> dict[str, Any] | None:
    """Read cached metrics JSON from disk, or synthesize from the simulated workbook."""
    if simulated:
        from app.ml.simulated import SimulatedDataError
        from app.ml.simulated_research import get_simulated_metrics_payload

        try:
            return get_simulated_metrics_payload()
        except SimulatedDataError:
            return None

    try:
        return read_json("metrics.json")
    except ArtifactMissing:
        return None


def get_walk_forward_records(
    limit: int | None = 30,
    *,
    simulated: bool = False,
) -> list[dict[str, Any]]:
    if simulated:
        from app.ml.simulated import SimulatedDataError, get_simulated_workbook

        try:
            workbook = get_simulated_workbook()
        except SimulatedDataError:
            return []
        df = workbook.forecast_history.copy()
        df = df.sort_values("date", ascending=False)
        if limit is not None:
            df = df.head(limit)
        df = df.sort_values("date")
        records = df.to_dict(orient="records")
        for row in records:
            if hasattr(row.get("date"), "strftime"):
                row["date"] = row["date"].strftime("%Y-%m-%d")
            else:
                row["date"] = str(row["date"])[:10]
        return records

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
