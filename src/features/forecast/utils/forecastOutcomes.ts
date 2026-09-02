import type { WalkForwardRecord } from '../api/types'
import { formatPercent } from './format'
import type { ForecastProbabilityPoint } from './forecastProbabilityTimeline'
import type { ForecastShiftHorizon } from './forecastShifts'

export type ForecastOutcomeStatus = 'correct' | 'incorrect' | 'unavailable'

export interface ForecastHorizonOutcome {
  status: ForecastOutcomeStatus
  /** True when this point is the live/current forecast rather than a scored history row. */
  isCurrent: boolean
  realizedReturn: number | null
  predicted: 0 | 1 | null
  actual: 0 | 1 | null
}

export const FORECAST_OUTCOME_DISCLAIMER =
  'A correct or incorrect directional score is an educational review of past model calls. It is not proof of investment performance.'

export function currentForecastOutcome(): ForecastHorizonOutcome {
  return {
    status: 'unavailable',
    isCurrent: true,
    realizedReturn: null,
    predicted: null,
    actual: null,
  }
}

/**
 * Map a walk-forward row to a scored or unavailable outcome.
 * Current-forecast overlays should use `currentForecastOutcome()` instead.
 */
export function deriveForecastOutcome(
  record: WalkForwardRecord | null | undefined,
): ForecastHorizonOutcome {
  if (!record) {
    return {
      status: 'unavailable',
      isCurrent: false,
      realizedReturn: null,
      predicted: null,
      actual: null,
    }
  }

  const predicted = asFlag(record.predicted)
  const actual = asFlag(record.actual)
  const realizedReturn = Number.isFinite(record.realized_return) ? record.realized_return : null

  if (actual == null || (record.correct !== 0 && record.correct !== 1)) {
    return {
      status: 'unavailable',
      isCurrent: false,
      realizedReturn,
      predicted,
      actual,
    }
  }

  return {
    status: record.correct === 1 ? 'correct' : 'incorrect',
    isCurrent: false,
    realizedReturn,
    predicted,
    actual,
  }
}

export function outcomeForHorizon(
  point: ForecastProbabilityPoint | null | undefined,
  horizon: ForecastShiftHorizon,
): ForecastHorizonOutcome | null {
  if (!point) return null
  return horizon === 'oneDay' ? (point.oneDayOutcome ?? null) : (point.fiveDayOutcome ?? null)
}

export function describeForecastOutcome(outcome: ForecastHorizonOutcome | null | undefined): string {
  if (!outcome) return 'Outcome not available'
  if (outcome.isCurrent) return 'Current forecast — outcome not available yet'
  if (outcome.status === 'correct') return 'Direction correct'
  if (outcome.status === 'incorrect') return 'Direction incorrect'
  return 'Outcome not available'
}

export function formatRealizedReturn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return formatPercent(value * 100, 2)
}

export function describeForecastOutcomeLine(
  outcome: ForecastHorizonOutcome | null | undefined,
): string {
  if (!outcome) return 'Outcome not available'
  if (outcome.status === 'unavailable' || outcome.isCurrent) {
    return describeForecastOutcome(outcome)
  }
  const realized =
    outcome.realizedReturn == null
      ? 'realized return unavailable'
      : `realized ${formatRealizedReturn(outcome.realizedReturn)}`
  return `${describeForecastOutcome(outcome)} · ${realized}`
}

function asFlag(value: number | null | undefined): 0 | 1 | null {
  if (value === 0 || value === 1) return value
  return null
}
