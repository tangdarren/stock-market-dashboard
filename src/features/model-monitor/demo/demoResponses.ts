import type {
  FeatureDriftScore,
  FeatureDriftStatusCounts,
  HoldoutBaselineSummary,
  ModelMonitoringResponse,
  MonitoringHorizon,
  MonitoringWindow,
  RollingWindowPoint,
} from '../api/types'

const SERIES_POINT = (offset: number, accuracy: number): RollingWindowPoint => ({
  n_observations: 30,
  start_date: `2025-0${Math.min(9, 1 + Math.floor(offset / 20))}-${String(
    1 + (offset % 20),
  ).padStart(2, '0')}`,
  end_date: `2025-0${Math.min(9, 2 + Math.floor(offset / 20))}-${String(
    10 + (offset % 18),
  ).padStart(2, '0')}`,
  accuracy,
  brier: 0.24,
  ece: 0.03,
  average_predicted_confidence: 0.58,
  actual_accuracy: accuracy,
  vs_baseline: {
    accuracy: accuracy - 0.52,
    brier: -0.01,
    ece: null,
    average_predicted_confidence: null,
    actual_accuracy: accuracy - 0.52,
  },
})

const BASELINE: HoldoutBaselineSummary = {
  accuracy: 0.52,
  brier: 0.25,
  ece: null,
  average_predicted_confidence: null,
  actual_accuracy: 0.52,
  n_observations: 805,
  test_period_start: '2023-05-01',
  test_period_end: '2026-07-16',
}

const FEATURE_ROW = (
  feature: string,
  status: FeatureDriftScore['status'],
  psi: number | null,
): FeatureDriftScore => ({
  feature,
  psi,
  status,
  recent: { mean: 0.01, std: 0.2, n_valid: 30 },
  reference: { mean: 0.0, std: 0.18, n_valid: 4000 },
  explanation:
    status === 'stable'
      ? `${feature} looks stable versus training (PSI=${psi?.toFixed(3) ?? 'n/a'}).`
      : status === 'watch'
        ? `${feature} has mild distribution shift versus training (PSI=${psi?.toFixed(3)}).`
        : status === 'drift_detected'
          ? `${feature} has drifted versus training (PSI=${psi?.toFixed(3)}).`
          : `${feature}: insufficient recent observations.`,
})

const STATUS_COUNTS: FeatureDriftStatusCounts = {
  stable: 22,
  watch: 3,
  drift_detected: 1,
  insufficient_data: 0,
}

export function demoModelMonitoring(
  horizon: MonitoringHorizon = '1d',
  window: MonitoringWindow = 30,
): ModelMonitoringResponse {
  const latest = SERIES_POINT(20, 0.54)
  latest.n_observations = window

  return {
    available: true,
    status: 'stable',
    status_explanation:
      'Model health looks stable for the selected horizon and window: rolling performance and feature distributions stay within watch thresholds.',
    status_reasons: [
      {
        source: 'aggregate',
        code: 'all_signals_stable',
        status: 'stable',
        detail:
          'No performance degradation or feature-drift signal exceeded the watch thresholds.',
      },
    ],
    horizon,
    horizon_days: horizon === '1d' ? 1 : 5,
    window,
    latest_performance: latest,
    baseline: BASELINE,
    rolling_series: [
      SERIES_POINT(0, 0.5),
      SERIES_POINT(5, 0.51),
      SERIES_POINT(10, 0.53),
      SERIES_POINT(15, 0.52),
      latest,
    ],
    confidence_vs_accuracy: {
      average_predicted_confidence: 0.58,
      actual_accuracy: 0.54,
      gap: 0.04,
      status: 'stable',
    },
    feature_drift: {
      ranked: [
        FEATURE_ROW('rsi_14', 'drift_detected', 0.31),
        FEATURE_ROW('rolling_vol_20', 'watch', 0.14),
        FEATURE_ROW('return_5d', 'watch', 0.12),
        FEATURE_ROW('macd', 'watch', 0.11),
        FEATURE_ROW('return_1d_lag', 'stable', 0.04),
        FEATURE_ROW('volume_zscore_20', 'stable', 0.03),
      ],
      status_counts: STATUS_COUNTS,
      start_date: '2025-06-01',
      end_date: '2025-07-15',
      train_start: '2010-01-05',
      train_end: '2023-04-28',
      feature_schema_fingerprint: 'demo-schema-01',
    },
    observation_counts: {
      rolling_window: window,
      rolling_available: 300,
      rolling_scored: window,
      feature_available: 400,
      feature_scored: window,
      baseline: 805,
    },
    timestamps: {
      generated_at: '2026-08-05T00:00:00+00:00',
      metrics_generated_at: '2026-07-18T06:51:20+00:00',
      monitoring_reference_generated_at: '2026-07-18T06:51:20+00:00',
      rolling_start_date: latest.start_date,
      rolling_end_date: latest.end_date,
      feature_window_start: '2025-06-01',
      feature_window_end: '2025-07-15',
    },
    model_version: 'v1-demo-monitor',
    thresholds: {
      psi: { stable_max: 0.1, watch_max: 0.25 },
      performance: {
        accuracy_drop_watch: 0.05,
        accuracy_drop_drift: 0.1,
        brier_rise_watch: 0.02,
        brier_rise_drift: 0.05,
        confidence_gap_watch: 0.05,
        confidence_gap_drift: 0.1,
      },
    },
    reason: null,
    detail: null,
  }
}

export const demoModelMonitoringUnavailable: ModelMonitoringResponse = {
  available: false,
  status: null,
  status_explanation:
    'Walk-forward predictions artifact is not present. Run training first.',
  status_reasons: [],
  horizon: '1d',
  horizon_days: 1,
  window: 30,
  latest_performance: null,
  baseline: null,
  rolling_series: [],
  confidence_vs_accuracy: null,
  feature_drift: null,
  observation_counts: {
    rolling_window: 30,
    rolling_available: 0,
    rolling_scored: 0,
    feature_available: 0,
    feature_scored: 0,
    baseline: null,
  },
  timestamps: {
    generated_at: '2026-08-05T00:00:00+00:00',
    metrics_generated_at: null,
    monitoring_reference_generated_at: null,
    rolling_start_date: null,
    rolling_end_date: null,
    feature_window_start: null,
    feature_window_end: null,
  },
  model_version: null,
  thresholds: {
    psi: { stable_max: 0.1, watch_max: 0.25 },
    performance: {
      accuracy_drop_watch: 0.05,
      accuracy_drop_drift: 0.1,
      brier_rise_watch: 0.02,
      brier_rise_drift: 0.05,
      confidence_gap_watch: 0.05,
      confidence_gap_drift: 0.1,
    },
  },
  reason: 'walk_forward_artifact_missing',
  detail: 'Walk-forward predictions artifact is not present. Run training first.',
}

export const demoMonitoring = demoModelMonitoring()
