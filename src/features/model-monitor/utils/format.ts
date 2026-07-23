import {
  MONITORING_HORIZONS,
  MONITORING_WINDOWS,
  type MonitoringHealthStatus,
  type MonitoringHorizon,
  type MonitoringSignalStatus,
  type MonitoringWindow,
} from '../api/types'

/** Matches backend CONFIDENCE_GAP_WATCH — keep UI and API bands aligned. */
export const CONFIDENCE_GAP_WATCH = 0.05
/** Matches backend CONFIDENCE_GAP_DRIFT. */
export const CONFIDENCE_GAP_DRIFT = 0.1

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

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

/** Signed percentage-point delta for accuracy/confidence fraction differences. */
export function formatSignedPercentDelta(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)} pp`
}

export function formatHorizonLabel(horizon: MonitoringHorizon): string {
  return horizon === '1d' ? '1-day' : '5-day'
}

export function formatWindowLabel(window: MonitoringWindow | number): string {
  return `${window}-session`
}

/**
 * Format a calendar ISO date (YYYY-MM-DD) without timezone shifting.
 * Falls back to the raw string when the shape is unexpected.
 */
export function formatMonitorDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  const year = match[1]
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

export function formatCompactDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  return `${match[2]}/${match[3]}`
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

/** Color-independent glyph paired with status labels. */
export function statusGlyph(status: MonitoringSignalStatus | null | undefined): string {
  switch (status) {
    case 'stable':
      return '●'
    case 'watch':
      return '▲'
    case 'drift_detected':
      return '■'
    case 'insufficient_data':
      return '○'
    default:
      return '–'
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
      return 'Out-of-sample predictions are missing. Train the models to generate monitoring artifacts.'
    case 'walk_forward_artifact_malformed':
      return 'Out-of-sample predictions are malformed and cannot be scored.'
    case 'monitoring_reference_missing':
      return 'The monitoring reference artifact is missing. Retrain to write monitoring_reference.json.'
    case 'monitoring_reference_malformed':
      return 'The monitoring reference artifact is malformed.'
    case 'monitoring_reference_horizon_missing':
      return 'No feature-drift reference exists for the selected horizon. Retrain to refresh monitoring.'
    case 'feature_schema_mismatch':
      return 'Feature schema changed since the reference was written. Retrain to refresh monitoring.'
    case 'market_history_missing':
      return 'Local SPY history is missing, so recent feature drift cannot be scored.'
    case 'market_history_malformed':
      return 'Local SPY history could not be parsed for feature drift scoring.'
    case 'insufficient_feature_history':
      return 'Not enough complete engineered feature rows for the selected window.'
    case 'feature_drift_unavailable':
      return 'Feature-drift scoring failed for this selection.'
    case 'insufficient_observations':
      return 'Not enough complete observations for the selected window.'
    default:
      return 'Model monitoring is temporarily unavailable.'
  }
}

export type ConfidenceReliabilityKind =
  | 'overconfident'
  | 'underconfident'
  | 'well_calibrated'
  | 'unavailable'

/**
 * Descriptive confidence-versus-accuracy direction.
 * Health escalation uses only overconfidence via {@link confidenceOverconfidenceStatus}
 * (and the authoritative API `status` field).
 */
export function confidenceReliabilityKind(
  gap: number | null | undefined,
  watchThreshold: number = CONFIDENCE_GAP_WATCH,
): ConfidenceReliabilityKind {
  if (gap == null || !Number.isFinite(gap)) return 'unavailable'
  // Mirror backend: overconfidence = max(0, gap); stable when overconfidence < watch.
  // Equality at the watch threshold is watch/overconfident.
  const overconfidence = Math.max(0, gap)
  if (overconfidence >= watchThreshold) return 'overconfident'
  if (gap < 0) return 'underconfident'
  return 'well_calibrated'
}

/**
 * Health band for overconfidence alone — matches backend
 * ``classify_higher_is_worse(max(0, gap), ...)``.
 */
export function confidenceOverconfidenceStatus(
  gap: number | null | undefined,
  watchThreshold: number = CONFIDENCE_GAP_WATCH,
  driftThreshold: number = CONFIDENCE_GAP_DRIFT,
): MonitoringSignalStatus | 'unavailable' {
  if (gap == null || !Number.isFinite(gap)) return 'unavailable'
  const overconfidence = Math.max(0, gap)
  if (overconfidence < watchThreshold) return 'stable'
  if (overconfidence < driftThreshold) return 'watch'
  return 'drift_detected'
}

export function confidenceReliabilityExplanation(
  gap: number | null | undefined,
  averageConfidence: number | null | undefined,
  actualAccuracy: number | null | undefined,
  watchThreshold: number = CONFIDENCE_GAP_WATCH,
): string {
  if (
    gap == null ||
    !Number.isFinite(gap) ||
    averageConfidence == null ||
    actualAccuracy == null
  ) {
    return 'Confidence and accuracy are not both available for this window.'
  }
  const conf = formatPercentScore(averageConfidence)
  const acc = formatPercentScore(actualAccuracy)
  const absGap = formatPercentScore(Math.abs(gap))
  const kind = confidenceReliabilityKind(gap, watchThreshold)
  if (kind === 'overconfident') {
    return `The model has recently been overconfident: average predicted confidence (${conf}) exceeds actual accuracy (${acc}) by ${absGap}. Health monitoring escalates on overconfidence of ${formatPercentScore(watchThreshold)} or more.`
  }
  if (kind === 'underconfident') {
    return `Actual accuracy (${acc}) exceeds average predicted confidence (${conf}) by ${absGap}. Underconfidence is shown for context only — health bands escalate on overconfidence, not underconfidence.`
  }
  return `Confidence and accuracy are closely aligned for this window (confidence ${conf}, accuracy ${acc}).`
}

export function statusBadgeVariant(
  status: MonitoringSignalStatus | null | undefined,
): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'stable':
      return 'success'
    case 'watch':
      return 'warning'
    case 'drift_detected':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function formatFeatureName(name: string): string {
  return name
    .split('_')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}

export function humanizeReasonCode(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}
