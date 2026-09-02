import { formatProbability } from './format'
import type { ForecastProbabilityPoint } from './forecastProbabilityTimeline'
import {
  detectForecastShifts,
  formatShiftChangePp,
  isDirectionalFlip,
  listConsecutiveForecastPairs,
  type ForecastShiftHorizon,
} from './forecastShifts'
import { pickPrimaryHorizonSeries } from './summarizeForecastEvolution'

export interface ForecastEvolutionStreak {
  side: 'bullish' | 'bearish'
  length: number
}

export interface ForecastEvolutionInsights {
  horizon: ForecastShiftHorizon
  streak: ForecastEvolutionStreak
  minProb: number
  maxProb: number
  rangePp: number
  largestChangePp: number
  flipCount: number
}

export function computeForecastEvolutionInsights(
  points: readonly ForecastProbabilityPoint[],
): ForecastEvolutionInsights | null {
  const primary = pickPrimaryHorizonSeries(points)
  if (!primary) return null

  const { horizon, values } = primary
  const last = values[values.length - 1]!
  const side: ForecastEvolutionStreak['side'] = last >= 0.5 ? 'bullish' : 'bearish'
  let length = 1
  for (let i = values.length - 2; i >= 0; i--) {
    const bullish = values[i]! >= 0.5
    if ((side === 'bullish') !== bullish) break
    length += 1
  }

  const minProb = Math.min(...values)
  const maxProb = Math.max(...values)
  const pairs = listConsecutiveForecastPairs(points).filter((pair) => pair.horizon === horizon)
  const largestChangePp = pairs.reduce(
    (largest, pair) =>
      Math.abs(pair.changePp) > Math.abs(largest) ? pair.changePp : largest,
    0,
  )
  const flipCount = detectForecastShifts(points).filter(
    (shift) => shift.horizon === horizon && isDirectionalFlip(shift.kinds),
  ).length

  return {
    horizon,
    streak: { side, length },
    minProb,
    maxProb,
    rangePp: (maxProb - minProb) * 100,
    largestChangePp,
    flipCount,
  }
}

export function formatInsightStreak(streak: ForecastEvolutionStreak): string {
  const sessions = streak.length === 1 ? 'session' : 'sessions'
  return `${streak.length} ${sessions} ${streak.side}`
}

export function formatInsightRange(minProb: number, maxProb: number): string {
  return `${formatProbability(minProb)}–${formatProbability(maxProb)}`
}

export function formatInsightFlips(count: number): string {
  return count === 1 ? '1 flip' : `${count} flips`
}

export function formatInsightLargestChange(changePp: number): string {
  return formatShiftChangePp(changePp)
}
