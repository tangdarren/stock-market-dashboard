import { demoForecast, demoHistory } from '../../demo/demoResponses'
import { buildForecastProbabilityTimeline } from '../forecastProbabilityTimeline'
import type { ForecastProbabilityPoint } from '../forecastProbabilityTimeline'
import {
  computeForecastEvolutionInsights,
  formatInsightFlips,
  formatInsightLargestChange,
  formatInsightRange,
  formatInsightStreak,
} from '../forecastEvolutionInsights'

function series(values: number[], horizon: 'oneDay' | 'fiveDay' = 'oneDay'): ForecastProbabilityPoint[] {
  return values.map((value, index) => ({
    date: `2024-09-${String(index + 1).padStart(2, '0')}`,
    oneDay: horizon === 'oneDay' ? value : null,
    fiveDay: horizon === 'fiveDay' ? value : null,
  }))
}

describe('computeForecastEvolutionInsights', () => {
  it('summarizes demo timeline streak, range, largest move, and flips', () => {
    const { points } = buildForecastProbabilityTimeline(demoForecast, demoHistory.records)
    const insights = computeForecastEvolutionInsights(points)

    expect(insights).toMatchObject({
      horizon: 'oneDay',
      streak: { side: 'bullish', length: 1 },
      minProb: 0.44,
      maxProb: 0.71,
      flipCount: 6,
    })
    expect(insights!.rangePp).toBeCloseTo(27, 5)
    expect(insights!.largestChangePp).toBeCloseTo(-23, 5)
    expect(formatInsightStreak(insights!.streak)).toBe('1 session bullish')
    expect(formatInsightRange(insights!.minProb, insights!.maxProb)).toBe('44.0%–71.0%')
    expect(formatInsightLargestChange(insights!.largestChangePp)).toBe('-23.0 pp')
    expect(formatInsightFlips(insights!.flipCount)).toBe('6 flips')
  })

  it('counts a multi-session bullish streak and a zero-flip window', () => {
    const insights = computeForecastEvolutionInsights(series([0.52, 0.58, 0.61, 0.66]))
    expect(insights).toMatchObject({
      streak: { side: 'bullish', length: 4 },
      flipCount: 0,
      minProb: 0.52,
      maxProb: 0.66,
    })
    expect(insights!.largestChangePp).toBeCloseTo(6, 5)
    expect(formatInsightStreak(insights!.streak)).toBe('4 sessions bullish')
    expect(formatInsightFlips(0)).toBe('0 flips')
  })

  it('counts a bearish streak after a flip and reports the largest consecutive change', () => {
    const insights = computeForecastEvolutionInsights(series([0.62, 0.41, 0.38, 0.33]))
    expect(insights).toMatchObject({
      streak: { side: 'bearish', length: 3 },
      flipCount: 1,
    })
    expect(insights!.largestChangePp).toBeCloseTo(-21, 5)
    expect(formatInsightStreak(insights!.streak)).toBe('3 sessions bearish')
    expect(formatInsightFlips(1)).toBe('1 flip')
  })

  it('uses 5-day readings when 1-day history is too sparse', () => {
    const insights = computeForecastEvolutionInsights(series([0.47, 0.44, 0.41], 'fiveDay'))
    expect(insights).toMatchObject({
      horizon: 'fiveDay',
      streak: { side: 'bearish', length: 3 },
      flipCount: 0,
    })
  })

  it('returns null when there are not enough readings', () => {
    expect(computeForecastEvolutionInsights(series([0.58]))).toBeNull()
    expect(computeForecastEvolutionInsights([])).toBeNull()
  })
})
