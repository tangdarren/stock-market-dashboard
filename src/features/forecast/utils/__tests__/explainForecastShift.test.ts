import { demoForecast, demoHistory, demoMarket } from '../../demo/demoResponses'
import { buildForecastProbabilityTimeline } from '../forecastProbabilityTimeline'
import { detectForecastShifts, indexForecastShifts } from '../forecastShifts'
import { explainForecastShift } from '../explainForecastShift'
import type { ForecastShift } from '../forecastShifts'
import type { SpyBar } from '../../api/types'

function latestDemoOneDayShift(): ForecastShift {
  const { points } = buildForecastProbabilityTimeline(demoForecast, demoHistory.records)
  const shift = indexForecastShifts(detectForecastShifts(points)).get('oneDay:2024-09-16')
  if (!shift) throw new Error('expected demo 1-day shift on 2024-09-16')
  return shift
}

describe('explainForecastShift', () => {
  it('reuses the shift probabilities, dates, and session-indicator comparison', () => {
    const explanation = explainForecastShift(latestDemoOneDayShift(), demoMarket.series)

    expect(explanation.previousDate).toBe('2024-09-13')
    expect(explanation.currentDate).toBe('2024-09-16')
    expect(explanation.previousProbUp).toBe(0.44)
    expect(explanation.currentProbUp).toBe(0.58)
    expect(explanation.changePp).toBeCloseTo(14, 5)
    expect(explanation.hasMarketSeries).toBe(true)
    expect(explanation.canCompute).toBe(true)
    expect(explanation.changes.length).toBeGreaterThan(0)
    expect(explanation.changes[0]?.sentence).toMatch(/from .+ to /i)
    expect(explanation.changes.map((change) => change.sentence).join(' ')).not.toMatch(
      /caused|because of|due to the model/i,
    )
  })

  it('reports missing market series without inventing indicator changes', () => {
    const explanation = explainForecastShift(latestDemoOneDayShift(), null)

    expect(explanation.hasMarketSeries).toBe(false)
    expect(explanation.canCompute).toBe(false)
    expect(explanation.changes).toEqual([])
    expect(explanation.previousProbUp).toBe(0.44)
    expect(explanation.currentProbUp).toBe(0.58)
  })

  it('reports when the series does not overlap both forecast dates', () => {
    const series: SpyBar[] = [
      {
        date: '2020-01-02',
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 50_000_000,
      },
    ]
    const explanation = explainForecastShift(latestDemoOneDayShift(), series)

    expect(explanation.hasMarketSeries).toBe(true)
    expect(explanation.canCompute).toBe(false)
    expect(explanation.changes).toEqual([])
  })

  it('uses the selected shift dates rather than the latest dashboard pair', () => {
    const earlier: ForecastShift = {
      date: '2024-09-05',
      previousDate: '2024-09-04',
      horizon: 'oneDay',
      kinds: ['significant_increase'],
      previousProbUp: 0.55,
      currentProbUp: 0.71,
      changePp: 16,
    }

    const explanation = explainForecastShift(earlier, demoMarket.series)

    expect(explanation.previousDate).toBe('2024-09-04')
    expect(explanation.currentDate).toBe('2024-09-05')
    expect(explanation.previousProbUp).toBe(0.55)
    expect(explanation.currentProbUp).toBe(0.71)
    expect(explanation.changePp).toBe(16)
    expect(explanation.canCompute).toBe(true)
  })
})
