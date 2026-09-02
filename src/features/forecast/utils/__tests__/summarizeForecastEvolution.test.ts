import { demoForecast, demoHistory } from '../../demo/demoResponses'
import { buildForecastProbabilityTimeline } from '../forecastProbabilityTimeline'
import type { ForecastProbabilityPoint } from '../forecastProbabilityTimeline'
import { summarizeForecastEvolution } from '../summarizeForecastEvolution'

function series(values: number[], horizon: 'oneDay' | 'fiveDay' = 'oneDay'): ForecastProbabilityPoint[] {
  return values.map((value, index) => ({
    date: `2024-09-${String(index + 1).padStart(2, '0')}`,
    oneDay: horizon === 'oneDay' ? value : null,
    fiveDay: horizon === 'fiveDay' ? value : null,
  }))
}

const OVERSTATEMENT = /will go up|will go down|buy|sell|guaranteed|definitely|must rise|must fall/i

describe('summarizeForecastEvolution', () => {
  it('describes an increasingly bullish recent window', () => {
    const summary = summarizeForecastEvolution(series([0.42, 0.48, 0.55, 0.62, 0.68]))
    expect(summary.kind).toBe('increasingly_bullish')
    expect(summary.horizon).toBe('oneDay')
    expect(summary.headline).toBe('Increasingly bullish across recent forecasts')
    expect(summary.detail).toMatch(/moved higher/i)
    expect(summary.detail).toMatch(/not a reason to expect SPY to keep rising/i)
    expect(summary.headline + summary.detail).not.toMatch(OVERSTATEMENT)
  })

  it('describes an increasingly bearish recent window', () => {
    const summary = summarizeForecastEvolution(series([0.68, 0.62, 0.55, 0.48, 0.4]))
    expect(summary.kind).toBe('increasingly_bearish')
    expect(summary.headline).toBe('Increasingly bearish across recent forecasts')
    expect(summary.detail).toMatch(/moved lower/i)
    expect(summary.detail).toMatch(/not a reason to expect SPY to keep falling/i)
  })

  it('describes a window that stays near even odds', () => {
    const summary = summarizeForecastEvolution(series([0.51, 0.49, 0.52, 0.5, 0.51]))
    expect(summary.kind).toBe('stable_near_neutral')
    expect(summary.headline).toBe('Mostly stable near neutral')
    expect(summary.detail).toMatch(/close to 50%/i)
    expect(summary.detail).toMatch(/not a forecast that SPY will stay flat/i)
  })

  it('prefers a recent 50% flip over a longer-window trend', () => {
    const summary = summarizeForecastEvolution(series([0.62, 0.6, 0.58, 0.44]))
    expect(summary.kind).toBe('directional_reversal')
    expect(summary.headline).toBe('Recent directional reversal')
    expect(summary.detail).toMatch(/crossed back across 50%/i)
    expect(summary.detail).toMatch(/not a prediction that the market will reverse/i)
  })

  it('falls back to mixed when recent readings chop without a lasting lean', () => {
    const summary = summarizeForecastEvolution(series([0.62, 0.49, 0.71, 0.52, 0.58]))
    expect(summary.kind).toBe('mixed')
    expect(summary.headline).toBe('No lasting lean in recent forecasts')
    expect(summary.detail).toMatch(/not a market call/i)
  })

  it('uses 5-day history when 1-day readings are too sparse', () => {
    const summary = summarizeForecastEvolution(series([0.41, 0.47, 0.56, 0.64], 'fiveDay'))
    expect(summary.kind).toBe('increasingly_bullish')
    expect(summary.horizon).toBe('fiveDay')
    expect(summary.detail).toMatch(/5-day/i)
  })

  it('prefers the denser 1-day series when both horizons exist', () => {
    const points: ForecastProbabilityPoint[] = [
      { date: '2024-09-10', oneDay: 0.41, fiveDay: 0.7 },
      { date: '2024-09-11', oneDay: 0.48, fiveDay: null },
      { date: '2024-09-12', oneDay: 0.56, fiveDay: null },
      { date: '2024-09-16', oneDay: 0.64, fiveDay: 0.39 },
    ]
    const summary = summarizeForecastEvolution(points)
    expect(summary.horizon).toBe('oneDay')
    expect(summary.kind).toBe('increasingly_bullish')
  })

  it('reports insufficient history for a single observation', () => {
    const summary = summarizeForecastEvolution(series([0.58]))
    expect(summary.kind).toBe('insufficient')
    expect(summary.horizon).toBeNull()
    expect(summary.headline).toMatch(/not enough recent forecasts/i)
  })

  it('summarizes demo timeline history as a recent directional reversal', () => {
    const { points } = buildForecastProbabilityTimeline(demoForecast, demoHistory.records)
    const summary = summarizeForecastEvolution(points)
    expect(summary.kind).toBe('directional_reversal')
    expect(summary.horizon).toBe('oneDay')
    expect(summary.detail).not.toMatch(OVERSTATEMENT)
  })
})
