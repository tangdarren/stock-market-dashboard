import { demoForecast, demoHistory } from '../../demo/demoResponses'
import type { ForecastResponse, WalkForwardRecord } from '../../api/types'
import {
  buildForecastProbabilityTimeline,
  hasEnoughTimelinePoints,
} from '../forecastProbabilityTimeline'

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

describe('buildForecastProbabilityTimeline', () => {
  it('merges demo history and current forecast without duplicating the as-of date', () => {
    const { points, hasOneDay, hasFiveDay } = buildForecastProbabilityTimeline(
      demoForecast,
      demoHistory.records,
    )

    expect(hasOneDay).toBe(true)
    expect(hasFiveDay).toBe(true)
    expect(points.filter((point) => point.date === '2024-09-16')).toHaveLength(1)

    const latest = points[points.length - 1]
    expect(latest).toMatchObject({
      date: '2024-09-16',
      oneDay: 0.58,
      fiveDay: 0.54,
    })

    const prior = points.find((point) => point.date === '2024-09-13')
    expect(prior).toMatchObject({ date: '2024-09-13', oneDay: 0.44, fiveDay: null })
  })

  it('uses the current forecast as the latest point when its date is new', () => {
    const history = [mkRecord('2024-09-13', 1, 0.44), mkRecord('2024-09-13', 5, 0.61)]
    const forecast: ForecastResponse = {
      ...demoForecast,
      features_as_of: '2024-09-17',
      one_day: { ...demoForecast.one_day!, features_as_of: '2024-09-17', prob_up: 0.6 },
      five_day: { ...demoForecast.five_day!, features_as_of: '2024-09-17', prob_up: 0.51 },
    }

    const { points } = buildForecastProbabilityTimeline(forecast, history)

    expect(points.map((point) => point.date)).toEqual(['2024-09-13', '2024-09-17'])
    expect(points[1]).toMatchObject({ date: '2024-09-17', oneDay: 0.6, fiveDay: 0.51 })
  })

  it('overwrites a history row on the current forecast date instead of plotting twice', () => {
    const history = [
      mkRecord('2024-09-13', 1, 0.4),
      mkRecord('2024-09-16', 1, 0.9),
      mkRecord('2024-09-16', 5, 0.2),
    ]

    const { points } = buildForecastProbabilityTimeline(demoForecast, history)
    const latest = points.find((point) => point.date === '2024-09-16')

    expect(points.filter((point) => point.date === '2024-09-16')).toHaveLength(1)
    expect(latest).toMatchObject({ oneDay: 0.58, fiveDay: 0.54 })
  })

  it('keeps the last history row when the same date and horizon appear twice', () => {
    const history = [
      mkRecord('2024-09-10', 1, 0.41),
      mkRecord('2024-09-10', 1, 0.47),
      mkRecord('2024-09-12', 1, 0.5),
    ]

    const { points } = buildForecastProbabilityTimeline(null, history)
    expect(points.find((point) => point.date === '2024-09-10')?.oneDay).toBe(0.47)
  })

  it('ignores non 1-day/5-day rows and invalid probabilities', () => {
    const history = [
      mkRecord('2024-09-10', 1, 0.52),
      mkRecord('2024-09-10', 10, 0.99),
      { ...mkRecord('2024-09-11', 1, 0.55), date: '' },
      { ...mkRecord('2024-09-12', 5, Number.NaN) },
      mkRecord('2024-09-13', 5, 0.61),
    ]

    const { points, hasOneDay, hasFiveDay } = buildForecastProbabilityTimeline(null, history)

    expect(hasOneDay).toBe(true)
    expect(hasFiveDay).toBe(true)
    expect(points.map((point) => point.date)).toEqual(['2024-09-10', '2024-09-13'])
    expect(points[0]).toMatchObject({ oneDay: 0.52, fiveDay: null })
    expect(points[1]).toMatchObject({ oneDay: null, fiveDay: 0.61 })
  })

  it('keeps only the most recent dates when history is longer than the window', () => {
    const history = Array.from({ length: 8 }, (_, index) =>
      mkRecord(`2024-09-${String(index + 1).padStart(2, '0')}`, 1, 0.5 + index / 100),
    )

    const { points } = buildForecastProbabilityTimeline(null, history, { maxPoints: 3 })

    expect(points.map((point) => point.date)).toEqual([
      '2024-09-06',
      '2024-09-07',
      '2024-09-08',
    ])
  })

  it('returns an empty series when history and the current forecast are missing', () => {
    expect(buildForecastProbabilityTimeline(null, null).points).toEqual([])
    expect(buildForecastProbabilityTimeline(undefined, []).points).toEqual([])
  })

  it('can plot a single current-forecast point when history is empty', () => {
    const { points, hasOneDay, hasFiveDay } = buildForecastProbabilityTimeline(
      demoForecast,
      [],
    )

    expect(points).toEqual([
      { date: '2024-09-16', oneDay: 0.58, fiveDay: 0.54 },
    ])
    expect(hasOneDay).toBe(true)
    expect(hasFiveDay).toBe(true)
    expect(hasEnoughTimelinePoints({ points, hasOneDay, hasFiveDay })).toBe(false)
  })
})

describe('hasEnoughTimelinePoints', () => {
  it('requires at least two dates and one horizon', () => {
    expect(
      hasEnoughTimelinePoints({
        points: [{ date: '2024-09-16', oneDay: 0.58, fiveDay: null }],
        hasOneDay: true,
        hasFiveDay: false,
      }),
    ).toBe(false)

    expect(
      hasEnoughTimelinePoints({
        points: [
          { date: '2024-09-13', oneDay: 0.44, fiveDay: null },
          { date: '2024-09-16', oneDay: 0.58, fiveDay: null },
        ],
        hasOneDay: true,
        hasFiveDay: false,
      }),
    ).toBe(true)
  })
})
