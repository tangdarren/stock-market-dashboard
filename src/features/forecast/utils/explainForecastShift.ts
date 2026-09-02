import type { SpyBar } from '../api/types'
import {
  compareSessionIndicators,
  indicatorsAtDate,
  type IndicatorChange,
} from './marketIndicators'
import type { ForecastShift } from './forecastShifts'

export interface ForecastShiftExplanation {
  shift: ForecastShift
  previousDate: string
  currentDate: string
  previousProbUp: number
  currentProbUp: number
  changePp: number
  hasMarketSeries: boolean
  canCompute: boolean
  previousIndicatorsAsOf: string | null
  currentIndicatorsAsOf: string | null
  changes: IndicatorChange[]
}

/**
 * Attach previous/current probabilities and the largest market-indicator
 * changes between a shift’s two forecast dates. Reuses the same comparison
 * helpers as ForecastChangePanel. Context only — not a causal explanation.
 */
export function explainForecastShift(
  shift: ForecastShift,
  series: readonly SpyBar[] | null | undefined,
  limit = 5,
): ForecastShiftExplanation {
  const hasMarketSeries = Boolean(series?.length)
  const previousIndicators = indicatorsAtDate(series, shift.previousDate)
  const currentIndicators = indicatorsAtDate(series, shift.date)
  const canCompute = Boolean(previousIndicators && currentIndicators)

  return {
    shift,
    previousDate: shift.previousDate,
    currentDate: shift.date,
    previousProbUp: shift.previousProbUp,
    currentProbUp: shift.currentProbUp,
    changePp: shift.changePp,
    hasMarketSeries,
    canCompute,
    previousIndicatorsAsOf: previousIndicators?.asOf ?? null,
    currentIndicatorsAsOf: currentIndicators?.asOf ?? null,
    changes: canCompute
      ? compareSessionIndicators(previousIndicators, currentIndicators, limit)
      : [],
  }
}
