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
    mode: Literal["live", "cached", "stale", "demo", "simulated", "model_unavailable"]
    disclaimer: str
    model_unavailable: bool = False
    reason: str | None = None


# ---------------------------------------------------------------------------
# Market Replay Lab
# ---------------------------------------------------------------------------


class ReplaySessionBarSchema(BaseModel):
    """One completed session inside a pre-reveal lookback window."""

    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    momentum_5d: float | None = None
    rsi_14: float | None = None
    rolling_vol_20: float | None = None
    distance_from_sma_20: float | None = None
    opening_gap_pct: float | None = None
    relative_volume: float | None = None


class ReplaySnapshotSchema(BaseModel):
    """Pre-reveal market state. Must not include model outputs or future labels."""

    selected_date: str
    lookback_sessions: int
    session_count: int
    sessions: list[ReplaySessionBarSchema]
    selected_session: ReplaySessionBarSchema | None = None


class ReplayHorizonOutcomeSchema(BaseModel):
    """Walk-forward evaluation outcome for one horizon."""

    horizon_days: int
    prob_up: float = Field(ge=0.0, le=1.0)
    predicted: int
    actual: int
    correct: bool
    realized_return: float
    direction_predicted: Literal["up", "down"]
    direction_actual: Literal["up", "down"]


class ReplayResultSchema(BaseModel):
    """Separate reveal payload sourced from walk-forward predictions."""

    selected_date: str
    one_day: ReplayHorizonOutcomeSchema
    five_day: ReplayHorizonOutcomeSchema
    source: Literal["walk_forward_predictions"] = "walk_forward_predictions"


class ReplayEligibleSessionsResponse(BaseModel):
    available: bool
    symbol: Literal["SPY"] = "SPY"
    eligible_dates: list[str]
    eligible_count: int
    lookback_sessions: int
    min_feature_history: int
    earliest_eligible: str | None = None
    latest_eligible: str | None = None
    disclaimer: str
    generated_at: str
    reason: str | None = None
    detail: str | None = None


class ReplayResponse(BaseModel):
    available: bool
    symbol: Literal["SPY"] = "SPY"
    selected_date: str | None = None
    lookback_sessions: int
    snapshot: ReplaySnapshotSchema | None = None
    result: ReplayResultSchema | None = None
    disclaimer: str
    generated_at: str
    reason: str | None = None
    detail: str | None = None


class ReplayChartBarSchema(BaseModel):
    """OHLCV point for the pre-reveal chart (no model/future fields)."""

    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class ReplayIndicatorsSchema(BaseModel):
    """Indicators known on the selected date only."""

    close: float | None = None
    momentum_5d: float | None = None
    rsi_14: float | None = None
    rolling_vol_20: float | None = None
    distance_from_sma_20: float | None = None
    opening_gap_pct: float | None = None
    relative_volume: float | None = None


class ReplayMethodologySchema(BaseModel):
    summary: str
    lookback_sessions: int
    min_feature_history: int
    horizons: list[int]
    prediction_source: Literal[
        "walk_forward_predictions", "simulated_forecast_history"
    ] = "walk_forward_predictions"
    feature_engineering: str = "build_features"


class ReplaySessionResponse(BaseModel):
    """Pre-reveal Market Replay Lab payload."""

    available: bool
    symbol: Literal["SPY"] = "SPY"
    selected_date: str | None = None
    min_eligible_date: str | None = None
    max_eligible_date: str | None = None
    nearest_eligible_before: str | None = None
    nearest_eligible_after: str | None = None
    lookback_sessions: int
    session_count: int
    series: list[ReplayChartBarSchema]
    indicators: ReplayIndicatorsSchema | None = None
    horizons: list[int]
    mode: Literal["historical", "unavailable", "simulated"]
    source: str
    methodology: ReplayMethodologySchema
    disclaimer: str
    generated_at: str
    reason: str | None = None
    detail: str | None = None
    data_classification: str | None = None


class ReplayResultApiHorizonSchema(BaseModel):
    horizon_days: int
    prob_up: float = Field(ge=0.0, le=1.0)
    direction_predicted: Literal["up", "down"]
    realized_return: float
    direction_actual: Literal["up", "down"]
    predicted: int
    actual: int
    correct: bool


class ReplayModelMetadataSchema(BaseModel):
    holdout_start: str | None = None
    holdout_end: str | None = None
    model_name_1d: str | None = None
    model_name_5d: str | None = None
    n_holdout_1d: int | None = None
    n_holdout_5d: int | None = None
    evaluation: str = "chronological_holdout_walk_forward"


class ReplayResultResponse(BaseModel):
    """Reveal payload sourced only from walk-forward evaluation output."""

    available: bool
    symbol: Literal["SPY"] = "SPY"
    selected_date: str | None = None
    one_day: ReplayResultApiHorizonSchema | None = None
    five_day: ReplayResultApiHorizonSchema | None = None
    source: Literal["walk_forward_predictions", "simulated_workbook"] = (
        "walk_forward_predictions"
    )
    evaluation_note: str
    disclaimer: str
    mode: Literal["historical", "unavailable", "simulated"]
    model_version: str | None = None
    model_metadata: ReplayModelMetadataSchema | None = None
    min_eligible_date: str | None = None
    max_eligible_date: str | None = None
    nearest_eligible_before: str | None = None
    nearest_eligible_after: str | None = None
    generated_at: str
    reason: str | None = None
    detail: str | None = None
    data_classification: str | None = None


# ---------------------------------------------------------------------------
# Model Health / Drift Center
# ---------------------------------------------------------------------------


class RollingMetricDeltas(BaseModel):
    """Differences from the corresponding holdout baseline in metrics.json."""

    accuracy: float | None = None
    brier: float | None = None
    ece: float | None = None
    average_predicted_confidence: float | None = None
    actual_accuracy: float | None = None


class RollingWindowPoint(BaseModel):
    """One completed rolling window observation for charting."""

    n_observations: int
    start_date: str
    end_date: str
    accuracy: float
    brier: float
    ece: float | None = None
    average_predicted_confidence: float | None = None
    actual_accuracy: float
    vs_baseline: RollingMetricDeltas


class HoldoutBaselineSummary(BaseModel):
    accuracy: float | None = None
    brier: float | None = None
    ece: float | None = None
    average_predicted_confidence: float | None = None
    actual_accuracy: float | None = None
    n_observations: int | None = None
    test_period_start: str | None = None
    test_period_end: str | None = None


class RollingWindowResult(BaseModel):
    horizon_days: int
    window: int
    sufficient: bool
    n_available: int
    series: list[RollingWindowPoint]
    latest: RollingWindowPoint | None = None


class HorizonRollingPerformance(BaseModel):
    baseline: HoldoutBaselineSummary | None = None
    windows: dict[str, RollingWindowResult]


class RollingModelPerformanceResponse(BaseModel):
    """Chronological rolling performance plus latest-window summaries."""

    available: bool
    windows: list[int]
    horizons: dict[str, HorizonRollingPerformance]
    baseline_available: bool = False
    reason: str | None = None
    detail: str | None = None


class FeatureDriftStats(BaseModel):
    mean: float | None = None
    std: float | None = None
    n_valid: int | None = None


class FeatureDriftScore(BaseModel):
    feature: str
    psi: float | None = None
    status: Literal["stable", "watch", "drift_detected", "insufficient_data"]
    recent: FeatureDriftStats
    reference: FeatureDriftStats
    explanation: str


class FeatureDriftStatusCounts(BaseModel):
    stable: int = 0
    watch: int = 0
    drift_detected: int = 0
    insufficient_data: int = 0


class FeatureDriftWindowResult(BaseModel):
    window: int
    sufficient: bool
    n_available: int
    n_scored: int
    start_date: str | None = None
    end_date: str | None = None
    status_counts: FeatureDriftStatusCounts
    features: list[FeatureDriftScore]


class HorizonFeatureDrift(BaseModel):
    available: bool
    train_start: str | None = None
    train_end: str | None = None
    n_train_rows: int | None = None
    windows: dict[str, FeatureDriftWindowResult] = Field(default_factory=dict)
    reason: str | None = None
    detail: str | None = None


class FeatureDriftResponse(BaseModel):
    """PSI feature-drift scores versus training-time monitoring_reference.json."""

    available: bool
    windows: list[int]
    horizons: dict[str, HorizonFeatureDrift]
    feature_schema_fingerprint: str | None = None
    psi_thresholds: dict[str, float]
    reason: str | None = None
    detail: str | None = None


class MonitoringStatusReason(BaseModel):
    """Machine-readable explanation for the overall health band."""

    source: str
    code: str
    status: Literal["stable", "watch", "drift_detected", "insufficient_data"] | None = None
    feature: str | None = None
    metric: str | None = None
    value: float | None = None
    threshold_watch: float | None = None
    threshold_drift: float | None = None
    detail: str


class ConfidenceVersusAccuracy(BaseModel):
    average_predicted_confidence: float
    actual_accuracy: float
    gap: float
    status: Literal["stable", "watch", "drift_detected", "insufficient_data"]


class MonitoringFeatureDriftBlock(BaseModel):
    ranked: list[FeatureDriftScore]
    status_counts: FeatureDriftStatusCounts
    start_date: str | None = None
    end_date: str | None = None
    train_start: str | None = None
    train_end: str | None = None
    feature_schema_fingerprint: str | None = None


class MonitoringObservationCounts(BaseModel):
    rolling_window: int
    rolling_available: int
    rolling_scored: int
    feature_available: int
    feature_scored: int
    baseline: int | None = None


class MonitoringTimestamps(BaseModel):
    generated_at: str
    metrics_generated_at: str | None = None
    monitoring_reference_generated_at: str | None = None
    rolling_start_date: str | None = None
    rolling_end_date: str | None = None
    feature_window_start: str | None = None
    feature_window_end: str | None = None


class ModelMonitoringResponse(BaseModel):
    """Combined Model Health and Drift Center payload for one horizon/window."""

    available: bool
    status: Literal["stable", "watch", "drift_detected"] | None = None
    status_explanation: str
    status_reasons: list[MonitoringStatusReason] = Field(default_factory=list)
    horizon: Literal["1d", "5d"]
    horizon_days: int
    window: int
    latest_performance: RollingWindowPoint | None = None
    baseline: HoldoutBaselineSummary | None = None
    rolling_series: list[RollingWindowPoint] = Field(default_factory=list)
    confidence_vs_accuracy: ConfidenceVersusAccuracy | None = None
    feature_drift: MonitoringFeatureDriftBlock | None = None
    observation_counts: MonitoringObservationCounts
    timestamps: MonitoringTimestamps
    model_version: str | None = None
    thresholds: dict[str, dict[str, float]]
    reason: str | None = None
    detail: str | None = None
    mode: Literal["live", "simulated"] | None = None
    source: str | None = None
    disclaimer: str | None = None
    data_classification: str | None = None
