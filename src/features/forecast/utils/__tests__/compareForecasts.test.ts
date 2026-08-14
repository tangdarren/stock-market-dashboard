import {
  compareForecastToPrevious,
  compareHorizonProbabilities,
  findPreviousForecastRecord,
} from '../compareForecasts'
import { demoForecast, demoHistory } from '../../demo/demoResponses'
import type { ForecastResponse, WalkForwardRecord } from '../../api/types'

function mkRecord(
  date: string,
  horizonDays: number,
  probUp: number,
): WalkForwardRecord {
  return {
    date,
    horizon_days: horizonDays,
    prob_up: probUp,
    predicted: probUp >= 0.5 ? 1 : 0,
    actual: 1,
    correct: 1,
    realized_return: 0.001,
  }
}

describe('findPreviousForecastRecord', () => {
  const records: WalkForwardRecord[] = [
    mkRecord('2024-09-10', 1, 0.52),
    mkRecord('2024-09-12', 1, 0.58),
    mkRecord('2024-09-13', 1, 0.44),
    mkRecord('2024-09-16', 1, 0.58),
    mkRecord('2024-09-16', 5, 0.54),
  ]

  it('returns the latest record strictly before asOf for the horizon', () => {
    const prev = findPreviousForecastRecord(records, 1, '2024-09-16')
    expect(prev).toMatchObject({ date: '2024-09-13', horizon_days: 1, prob_up: 0.44 })
  })

  it('returns null when there is no earlier record for the horizon', () => {
    expect(findPreviousForecastRecord(records, 5, '2024-09-16')).toBeNull()
    expect(findPreviousForecastRecord(records, 1, '2024-09-01')).toBeNull()
  })

  it('falls back to the second-newest row when asOf is missing', () => {
    const prev = findPreviousForecastRecord(records, 1, null)
    expect(prev).toMatchObject({ date: '2024-09-13', prob_up: 0.44 })
  })

  it('returns null for empty or missing history', () => {
    expect(findPreviousForecastRecord([], 1, '2024-09-16')).toBeNull()
    expect(findPreviousForecastRecord(null, 1, '2024-09-16')).toBeNull()
    expect(findPreviousForecastRecord(undefined, 1, '2024-09-16')).toBeNull()
  })
})

describe('compareHorizonProbabilities', () => {
  it('reports bullish probabilities and percentage-point change', () => {
    const cmp = compareHorizonProbabilities(1, 0.58, 0.44, '2024-09-13')
    expect(cmp.previousProbUp).toBe(0.44)
    expect(cmp.currentProbUp).toBe(0.58)
    expect(cmp.probUpChangePp).toBeCloseTo(14, 5)
    expect(cmp.previousConfidence).toBe('moderate')
    expect(cmp.currentConfidence).toBe('moderate')
    expect(cmp.previousDate).toBe('2024-09-13')
  })

  it('marks confidence as increased when peak conviction rises', () => {
    // peak 0.55 (moderate) → 0.70 (high)
    const cmp = compareHorizonProbabilities(1, 0.7, 0.55, '2024-01-01')
    expect(cmp.confidenceChange).toBe('increased')
    expect(cmp.previousConfidence).toBe('moderate')
    expect(cmp.currentConfidence).toBe('high')
  })

  it('marks confidence as decreased when peak conviction falls', () => {
    // peak 0.70 → 0.52
    const cmp = compareHorizonProbabilities(5, 0.52, 0.3, '2024-01-01')
    expect(cmp.confidenceChange).toBe('decreased')
  })

  it('marks confidence as approximately unchanged for tiny peak moves', () => {
    // peak 0.58 → 0.585 (< 1pp)
    const cmp = compareHorizonProbabilities(1, 0.585, 0.58, '2024-01-01')
    expect(cmp.confidenceChange).toBe('unchanged')
  })

  it('treats a flip across 50% with the same peak as unchanged confidence', () => {
    // 0.40 (peak 0.60) → 0.60 (peak 0.60)
    const cmp = compareHorizonProbabilities(1, 0.6, 0.4, '2024-01-01')
    expect(cmp.probUpChangePp).toBeCloseTo(20, 5)
    expect(cmp.confidenceChange).toBe('unchanged')
  })
})

describe('compareForecastToPrevious', () => {
  it('compares demo 1-day current vs prior history and skips lone 5-day history', () => {
    const cmp = compareForecastToPrevious(demoForecast, demoHistory.records)
    expect(cmp.oneDay).toMatchObject({
      horizonDays: 1,
      previousProbUp: 0.44,
      currentProbUp: 0.58,
      previousDate: '2024-09-13',
      // Peak conviction: max(0.44,0.56)=0.56 → max(0.58,0.42)=0.58
      confidenceChange: 'increased',
      previousConfidence: 'moderate',
      currentConfidence: 'moderate',
    })
    expect(cmp.oneDay!.probUpChangePp).toBeCloseTo(14, 5)
    // Demo history only has one 5-day row on the current as-of date.
    expect(cmp.fiveDay).toBeNull()
  })

  it('compares both horizons when prior rows exist', () => {
    const history = [
      mkRecord('2024-09-10', 1, 0.5),
      mkRecord('2024-09-13', 1, 0.4),
      mkRecord('2024-09-10', 5, 0.48),
      mkRecord('2024-09-13', 5, 0.61),
      mkRecord('2024-09-16', 1, 0.58),
      mkRecord('2024-09-16', 5, 0.54),
    ]
    const forecast: ForecastResponse = {
      ...demoForecast,
      one_day: { ...demoForecast.one_day!, prob_up: 0.58, prob_down: 0.42 },
      five_day: { ...demoForecast.five_day!, prob_up: 0.54, prob_down: 0.46 },
    }

    const cmp = compareForecastToPrevious(forecast, history)
    expect(cmp.oneDay).toMatchObject({
      previousProbUp: 0.4,
      currentProbUp: 0.58,
      previousDate: '2024-09-13',
    })
    expect(cmp.fiveDay).toMatchObject({
      previousProbUp: 0.61,
      currentProbUp: 0.54,
      previousDate: '2024-09-13',
      confidenceChange: 'decreased',
    })
    expect(cmp.fiveDay!.probUpChangePp).toBeCloseTo(-7, 5)
  })

  it('returns null horizons when current forecast or prior history is missing', () => {
    expect(compareForecastToPrevious(null, demoHistory.records)).toEqual({
      oneDay: null,
      fiveDay: null,
    })
    expect(compareForecastToPrevious(demoForecast, [])).toEqual({
      oneDay: null,
      fiveDay: null,
    })
    expect(
      compareForecastToPrevious(
        { ...demoForecast, one_day: null, five_day: null },
        demoHistory.records,
      ),
    ).toEqual({ oneDay: null, fiveDay: null })
  })
})
