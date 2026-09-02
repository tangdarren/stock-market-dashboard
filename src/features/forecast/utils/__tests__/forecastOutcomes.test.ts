import { demoForecast, demoHistory } from '../../demo/demoResponses'
import type { WalkForwardRecord } from '../../api/types'
import { buildForecastProbabilityTimeline } from '../forecastProbabilityTimeline'
import {
  currentForecastOutcome,
  deriveForecastOutcome,
  describeForecastOutcome,
  describeForecastOutcomeLine,
  formatRealizedReturn,
  outcomeForHorizon,
} from '../forecastOutcomes'

function mkRecord(
  overrides: Partial<WalkForwardRecord> & Pick<WalkForwardRecord, 'date' | 'prob_up'>,
): WalkForwardRecord {
  return {
    horizon_days: 1,
    predicted: 1,
    actual: 1,
    correct: 1,
    realized_return: 0.0041,
    ...overrides,
  }
}

describe('deriveForecastOutcome', () => {
  it('marks a scored row as correct with its realized return', () => {
    const outcome = deriveForecastOutcome(
      mkRecord({ date: '2024-09-13', prob_up: 0.44, predicted: 0, actual: 0, correct: 1, realized_return: -0.0027 }),
    )
    expect(outcome).toEqual({
      status: 'correct',
      isCurrent: false,
      realizedReturn: -0.0027,
      predicted: 0,
      actual: 0,
    })
    expect(describeForecastOutcome(outcome)).toBe('Direction correct')
    expect(describeForecastOutcomeLine(outcome)).toBe('Direction correct · realized -0.27%')
    expect(formatRealizedReturn(outcome.realizedReturn)).toBe('-0.27%')
  })

  it('marks a scored row as incorrect without treating the miss as a trading loss', () => {
    const outcome = deriveForecastOutcome(
      mkRecord({ date: '2024-09-04', prob_up: 0.55, predicted: 1, actual: 0, correct: 0, realized_return: -0.0015 }),
    )
    expect(outcome.status).toBe('incorrect')
    expect(outcome.isCurrent).toBe(false)
    expect(describeForecastOutcome(outcome)).toBe('Direction incorrect')
    expect(describeForecastOutcomeLine(outcome)).toBe(
      'Direction incorrect · realized -0.15%',
    )
    expect(describeForecastOutcomeLine(outcome)).not.toMatch(/loss|profit|performance/i)
  })

  it('treats an incomplete history row as unavailable', () => {
    const outcome = deriveForecastOutcome(
      mkRecord({
        date: '2024-09-16',
        prob_up: 0.58,
        actual: Number.NaN,
        correct: Number.NaN,
        realized_return: Number.NaN,
      }),
    )
    expect(outcome.status).toBe('unavailable')
    expect(outcome.isCurrent).toBe(false)
    expect(outcome.realizedReturn).toBeNull()
    expect(describeForecastOutcome(outcome)).toBe('Outcome not available')
  })

  it('treats a missing record as unavailable', () => {
    expect(deriveForecastOutcome(null).status).toBe('unavailable')
    expect(deriveForecastOutcome(undefined).status).toBe('unavailable')
  })
})

describe('currentForecastOutcome', () => {
  it('is unavailable and labeled as the current forecast', () => {
    const outcome = currentForecastOutcome()
    expect(outcome).toEqual({
      status: 'unavailable',
      isCurrent: true,
      realizedReturn: null,
      predicted: null,
      actual: null,
    })
    expect(describeForecastOutcome(outcome)).toBe(
      'Current forecast — outcome not available yet',
    )
    expect(describeForecastOutcomeLine(outcome)).toBe(
      'Current forecast — outcome not available yet',
    )
  })
})

describe('timeline outcome attachment', () => {
  it('keeps scored history and marks the current forecast date as unscored', () => {
    const { points } = buildForecastProbabilityTimeline(demoForecast, demoHistory.records)
    const prior = points.find((point) => point.date === '2024-09-13')
    const latest = points.find((point) => point.date === '2024-09-16')
    const missed = points.find((point) => point.date === '2024-09-04')

    expect(outcomeForHorizon(prior, 'oneDay')).toMatchObject({
      status: 'correct',
      isCurrent: false,
      realizedReturn: -0.0027,
    })
    expect(outcomeForHorizon(missed, 'oneDay')).toMatchObject({
      status: 'incorrect',
      isCurrent: false,
      realizedReturn: -0.0015,
    })
    expect(outcomeForHorizon(latest, 'oneDay')).toMatchObject({
      status: 'unavailable',
      isCurrent: true,
      realizedReturn: null,
    })
    expect(outcomeForHorizon(latest, 'fiveDay')).toMatchObject({
      status: 'unavailable',
      isCurrent: true,
    })
  })
})
