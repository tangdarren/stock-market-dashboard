"""Pydantic schemas for training / inference artifact payloads and API DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class FeatureSchema(BaseModel):
    features: list[str]
    adjustment: Literal["unadjusted"] = "unadjusted"
    trained_at: datetime
    training_rows: int
    horizon_days: int
    model_family: str


class ExplanationFactor(BaseModel):
    label: str
    feature: str
    value: float
    direction: Literal["up", "down", "uncertainty"]
    contribution: float
    plain_english: str


class HorizonForecast(BaseModel):
    horizon_days: int
    prob_up: float = Field(ge=0.0, le=1.0)
    prob_down: float = Field(ge=0.0, le=1.0)
    direction: Literal["up", "down"]
    confidence: Literal["low", "moderate", "high"]
    model_name: str
    trained_at: datetime
    features_as_of: str
    explanations: list[ExplanationFactor]


class ForecastResponse(BaseModel):
    one_day: HorizonForecast | None
    five_day: HorizonForecast | None
    features_as_of: str
    data_as_of: str
    mode: Literal["live", "cached", "stale", "demo", "model_unavailable"]
    disclaimer: str
    model_unavailable: bool = False
    reason: str | None = None
