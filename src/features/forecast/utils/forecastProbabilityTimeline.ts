import type { ForecastResponse, HorizonForecast, WalkForwardRecord } from '../api/types'
import {
  currentForecastOutcome,
  deriveForecastOutcome,
  type ForecastHorizonOutcome,
} from './forecastOutcomes'

/** Most recent unique session dates to plot. */
export const RECENT_TIMELINE_POINTS = 20

/** A timeline needs at least two dates to show change over time. */
export const MIN_TIMELINE_POINTS = 2

export interface ForecastProbabilityPoint {
  date: string
  /** Bullish probability in [0, 1], or null when that horizon has no row on this date. */
  oneDay: number | null
  fiveDay: number | null
  oneDayOutcome?: ForecastHorizonOutcome | null
  fiveDayOutcome?: ForecastHorizonOutcome | null
}

export interface ForecastProbabilityTimelineData {
  points: ForecastProbabilityPoint[]
  hasOneDay: boolean
  hasFiveDay: boolean
}

/**
 * Build a date-aligned series of recent 1-day and 5-day bullish probabilities
 * from walk-forward history, overlaying the current forecast as the latest
 * value for its session date so that date is not plotted twice.
 */
export function buildForecastProbabilityTimeline(
  forecast: ForecastResponse | null | undefined,
  historyRecords: readonly WalkForwardRecord[] | null | undefined,
  options?: { maxPoints?: number },
): ForecastProbabilityTimelineData {
  const maxPoints = options?.maxPoints ?? RECENT_TIMELINE_POINTS
  const byDate = new Map<string, ForecastProbabilityPoint>()

  const history = (historyRecords ?? [])
    .filter((row) => isPlottableRecord(row))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  for (const row of history) {
    upsertPoint(byDate, row.date, row.horizon_days, row.prob_up, deriveForecastOutcome(row))
  }

  overlayCurrentHorizon(byDate, forecast, forecast?.one_day ?? null, 1)
  overlayCurrentHorizon(byDate, forecast, forecast?.five_day ?? null, 5)

  const points = Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-Math.max(1, maxPoints))

  return {
    points,
    hasOneDay: points.some((point) => point.oneDay != null),
    hasFiveDay: points.some((point) => point.fiveDay != null),
  }
}

export function hasEnoughTimelinePoints(
  data: ForecastProbabilityTimelineData,
): boolean {
  return data.points.length >= MIN_TIMELINE_POINTS && (data.hasOneDay || data.hasFiveDay)
}

function overlayCurrentHorizon(
  byDate: Map<string, ForecastProbabilityPoint>,
  forecast: ForecastResponse | null | undefined,
  horizon: HorizonForecast | null,
  horizonDays: 1 | 5,
): void {
  if (!horizon || !Number.isFinite(horizon.prob_up)) return
  const date =
    horizon.features_as_of || forecast?.features_as_of || forecast?.data_as_of || null
  if (!date) return
  upsertPoint(byDate, date, horizonDays, horizon.prob_up, currentForecastOutcome())
}

function upsertPoint(
  byDate: Map<string, ForecastProbabilityPoint>,
  date: string,
  horizonDays: number,
  probUp: number,
  outcome: ForecastHorizonOutcome | null,
): void {
  const existing = byDate.get(date) ?? {
    date,
    oneDay: null,
    fiveDay: null,
    oneDayOutcome: null,
    fiveDayOutcome: null,
  }
  const value = clamp01(probUp)
  if (horizonDays === 1) {
    existing.oneDay = value
    existing.oneDayOutcome = outcome
  }
  if (horizonDays === 5) {
    existing.fiveDay = value
    existing.fiveDayOutcome = outcome
  }
  byDate.set(date, existing)
}

function isPlottableRecord(row: WalkForwardRecord): boolean {
  return (
    Boolean(row.date) &&
    (row.horizon_days === 1 || row.horizon_days === 5) &&
    Number.isFinite(row.prob_up)
  )
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
