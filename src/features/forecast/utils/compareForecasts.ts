import type {
  Confidence,
  ForecastResponse,
  HorizonForecast,
  WalkForwardRecord,
} from '../api/types'
import { confidenceLabel } from './confidence'

/** How peak conviction moved versus the previous forecast. */
export type ConfidenceChange = 'increased' | 'decreased' | 'unchanged'

export interface HorizonForecastComparison {
  horizonDays: number
  /** Bullish probability on the previous forecast for this horizon, in [0, 1]. */
  previousProbUp: number
  /** Bullish probability on the current forecast for this horizon, in [0, 1]. */
  currentProbUp: number
  /**
   * Current minus previous bullish probability, in percentage points
   * (e.g. 0.58 − 0.44 → `14`).
   */
  probUpChangePp: number
  previousConfidence: Confidence
  currentConfidence: Confidence
  confidenceChange: ConfidenceChange
  /** Session date of the previous walk-forward row used for comparison. */
  previousDate: string
}

export interface ForecastComparison {
  oneDay: HorizonForecastComparison | null
  fiveDay: HorizonForecastComparison | null
}

/** Peak-probability deltas below this (fraction) count as approximately unchanged. */
const CONFIDENCE_UNCHANGED_EPS = 0.01

/**
 * Pick the most recent walk-forward row for `horizonDays` that is strictly
 * earlier than `asOf` (the current forecast's `features_as_of`). When `asOf`
 * is missing, fall back to the second-newest row so the newest is treated as
 * "current" and not compared against itself.
 */
export function findPreviousForecastRecord(
  records: readonly WalkForwardRecord[] | null | undefined,
  horizonDays: number,
  asOf?: string | null,
): WalkForwardRecord | null {
  if (!records?.length) return null

  const sorted = records
    .filter((r) => r.horizon_days === horizonDays)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  if (sorted.length === 0) return null

  if (asOf) {
    const prior = sorted.filter((r) => r.date < asOf)
    return prior.length > 0 ? prior[prior.length - 1]! : null
  }

  if (sorted.length < 2) return null
  return sorted[sorted.length - 2]!
}

/**
 * Compare two bullish probabilities and report probability / confidence deltas.
 * Confidence uses the same peak-probability labels as `confidenceLabel`.
 */
export function compareHorizonProbabilities(
  horizonDays: number,
  currentProbUp: number,
  previousProbUp: number,
  previousDate: string,
): HorizonForecastComparison {
  const current = clamp01(currentProbUp)
  const previous = clamp01(previousProbUp)
  const previousConfidence = confidenceLabel(previous)
  const currentConfidence = confidenceLabel(current)

  return {
    horizonDays,
    previousProbUp: previous,
    currentProbUp: current,
    probUpChangePp: (current - previous) * 100,
    previousConfidence,
    currentConfidence,
    confidenceChange: classifyConfidenceChange(previous, current),
    previousDate,
  }
}

/**
 * Compare the latest SPY 1-day and 5-day forecasts against the most recent
 * previous walk-forward forecast for each horizon. Reuses `/forecasts/spy`
 * plus `/forecasts/history` — no additional endpoint.
 */
export function compareForecastToPrevious(
  forecast: ForecastResponse | null | undefined,
  historyRecords: readonly WalkForwardRecord[] | null | undefined,
): ForecastComparison {
  return {
    oneDay: compareHorizon(forecast?.one_day ?? null, historyRecords, 1, forecast?.features_as_of),
    fiveDay: compareHorizon(forecast?.five_day ?? null, historyRecords, 5, forecast?.features_as_of),
  }
}

function compareHorizon(
  current: HorizonForecast | null,
  historyRecords: readonly WalkForwardRecord[] | null | undefined,
  horizonDays: number,
  forecastAsOf: string | null | undefined,
): HorizonForecastComparison | null {
  if (!current) return null

  const asOf = current.features_as_of || forecastAsOf || null
  const previous = findPreviousForecastRecord(historyRecords, horizonDays, asOf)
  if (!previous) return null

  return compareHorizonProbabilities(
    horizonDays,
    current.prob_up,
    previous.prob_up,
    previous.date,
  )
}

function classifyConfidenceChange(
  previousProbUp: number,
  currentProbUp: number,
): ConfidenceChange {
  const previousPeak = Math.max(previousProbUp, 1 - previousProbUp)
  const currentPeak = Math.max(currentProbUp, 1 - currentProbUp)
  const delta = currentPeak - previousPeak
  if (Math.abs(delta) < CONFIDENCE_UNCHANGED_EPS) return 'unchanged'
  return delta > 0 ? 'increased' : 'decreased'
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0
  return Math.max(0, Math.min(1, x))
}
