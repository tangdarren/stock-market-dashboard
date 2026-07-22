import {
  MONITORING_HORIZONS,
  MONITORING_WINDOWS,
  type MonitoringHealthStatus,
  type MonitoringHorizon,
  type MonitoringSignalStatus,
  type MonitoringWindow,
} from '../api/types'

export function isMonitoringHorizon(value: unknown): value is MonitoringHorizon {
  return typeof value === 'string' && (MONITORING_HORIZONS as readonly string[]).includes(value)
}

export function isMonitoringWindow(value: unknown): value is MonitoringWindow {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && (MONITORING_WINDOWS as readonly number[]).includes(n)
}

export function parseMonitoringHorizon(
  value: string | null | undefined,
  fallback: MonitoringHorizon = '1d',
): MonitoringHorizon {
  return isMonitoringHorizon(value) ? value : fallback
}

export function parseMonitoringWindow(
  value: string | null | undefined,
  fallback: MonitoringWindow = 30,
): MonitoringWindow {
  if (value == null) return fallback
  const n = Number(value)
  return isMonitoringWindow(n) ? n : fallback
}

export function formatMetricScore(
  value: number | null | undefined,
  decimals = 3,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

export function formatSignedDelta(
  value: number | null | undefined,
  decimals = 3,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

export function formatPercentScore(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatHorizonLabel(horizon: MonitoringHorizon): string {
  return horizon === '1d' ? '1-day' : '5-day'
}

export function formatWindowLabel(window: MonitoringWindow | number): string {
  return `${window}-session`
}

export function statusLabel(status: MonitoringSignalStatus | null | undefined): string {
  switch (status) {
    case 'stable':
      return 'Stable'
    case 'watch':
      return 'Watch'
    case 'drift_detected':
      return 'Drift detected'
    case 'insufficient_data':
      return 'Insufficient data'
    default:
      return 'Unavailable'
  }
}

export function statusToneClass(
  status: MonitoringSignalStatus | null | undefined,
): string {
  switch (status) {
    case 'stable':
      return 'border-[#00FFB2]/35 bg-[#00FFB2]/10 text-[#00FFB2]'
    case 'watch':
      return 'border-amber-400/35 bg-amber-400/10 text-amber-300'
    case 'drift_detected':
      return 'border-red-400/35 bg-red-500/10 text-red-300'
    case 'insufficient_data':
      return 'border-white/10 bg-white/[0.04] text-slate-300'
    default:
      return 'border-white/10 bg-white/[0.04] text-slate-400'
  }
}

export function overallStatusHeadline(
  status: MonitoringHealthStatus | null | undefined,
): string {
  switch (status) {
    case 'stable':
      return 'Model health is stable'
    case 'watch':
      return 'Model health needs attention'
    case 'drift_detected':
      return 'Model drift detected'
    default:
      return 'Model health unavailable'
  }
}

export function unavailableReasonMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'walk_forward_artifact_missing':
      return 'Walk-forward predictions are missing. Train the models to generate monitoring artifacts.'
    case 'walk_forward_artifact_malformed':
      return 'Walk-forward predictions are malformed and cannot be scored.'
    case 'monitoring_reference_missing':
      return 'The monitoring reference artifact is missing. Retrain to write monitoring_reference.json.'
    case 'monitoring_reference_malformed':
      return 'The monitoring reference artifact is malformed.'
    case 'feature_schema_mismatch':
      return 'Feature schema changed since the reference was written. Retrain to refresh monitoring.'
    case 'market_history_missing':
      return 'Local SPY history is missing, so recent feature drift cannot be scored.'
    case 'insufficient_observations':
      return 'Not enough complete observations for the selected window.'
    default:
      return 'Model monitoring is temporarily unavailable.'
  }
}
