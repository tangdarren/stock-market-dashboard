/** TypeScript types matching GET /api/v1/model/monitoring. */

export type MonitoringHorizon = '1d' | '5d'

export type MonitoringWindow = 30 | 60 | 120 | 252

export type MonitoringHealthStatus = 'stable' | 'watch' | 'drift_detected'

export type MonitoringSignalStatus =
  | MonitoringHealthStatus
  | 'insufficient_data'

export const MONITORING_HORIZONS: readonly MonitoringHorizon[] = ['1d', '5d']

export const MONITORING_WINDOWS: readonly MonitoringWindow[] = [30, 60, 120, 252]

export interface RollingMetricDeltas {
  accuracy: number | null
  brier: number | null
  ece: number | null
  average_predicted_confidence: number | null
  actual_accuracy: number | null
}

export interface RollingWindowPoint {
  n_observations: number
  start_date: string
  end_date: string
  accuracy: number
  brier: number
  ece: number | null
  average_predicted_confidence: number | null
  actual_accuracy: number
  vs_baseline: RollingMetricDeltas
}

export interface HoldoutBaselineSummary {
  accuracy: number | null
  brier: number | null
  ece: number | null
  average_predicted_confidence: number | null
  actual_accuracy: number | null
  n_observations: number | null
  test_period_start: string | null
  test_period_end: string | null
}

export interface FeatureDriftStats {
  mean: number | null
  std: number | null
  n_valid: number | null
}

export interface FeatureDriftScore {
  feature: string
  psi: number | null
  status: MonitoringSignalStatus
  recent: FeatureDriftStats
  reference: FeatureDriftStats
  explanation: string
}

export interface FeatureDriftStatusCounts {
  stable: number
  watch: number
  drift_detected: number
  insufficient_data: number
}

export interface MonitoringStatusReason {
  source: string
  code: string
  status?: MonitoringSignalStatus | null
  feature?: string | null
  metric?: string | null
  value?: number | null
  threshold_watch?: number | null
  threshold_drift?: number | null
  detail: string
}

export interface ConfidenceVersusAccuracy {
  average_predicted_confidence: number
  actual_accuracy: number
  gap: number
  status: MonitoringSignalStatus
}

export interface MonitoringFeatureDriftBlock {
  ranked: FeatureDriftScore[]
  status_counts: FeatureDriftStatusCounts
  start_date: string | null
  end_date: string | null
  train_start: string | null
  train_end: string | null
  feature_schema_fingerprint: string | null
}

export interface MonitoringObservationCounts {
  rolling_window: number
  rolling_available: number
  rolling_scored: number
  feature_available: number
  feature_scored: number
  baseline: number | null
}

export interface MonitoringTimestamps {
  generated_at: string
  metrics_generated_at: string | null
  monitoring_reference_generated_at: string | null
  rolling_start_date: string | null
  rolling_end_date: string | null
  feature_window_start: string | null
  feature_window_end: string | null
}

export interface ModelMonitoringResponse {
  available: boolean
  status: MonitoringHealthStatus | null
  status_explanation: string
  status_reasons: MonitoringStatusReason[]
  horizon: MonitoringHorizon
  horizon_days: number
  window: number
  latest_performance: RollingWindowPoint | null
  baseline: HoldoutBaselineSummary | null
  rolling_series: RollingWindowPoint[]
  confidence_vs_accuracy: ConfidenceVersusAccuracy | null
  feature_drift: MonitoringFeatureDriftBlock | null
  observation_counts: MonitoringObservationCounts
  timestamps: MonitoringTimestamps
  model_version: string | null
  thresholds: Record<string, Record<string, number>>
  reason: string | null
  detail: string | null
}

export interface ModelMonitoringQuery {
  horizon: MonitoringHorizon
  window: MonitoringWindow
}
