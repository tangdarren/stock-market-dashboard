import { demoForecast, demoHistory } from '../../demo/demoResponses'
import { buildForecastProbabilityTimeline } from '../forecastProbabilityTimeline'
import {
  SIGNIFICANT_FORECAST_SHIFT,
  SIGNIFICANT_FORECAST_SHIFT_PP,
  classifyForecastShift,
  describeForecastShift,
  detectForecastShifts,
  indexForecastShifts,
  primaryForecastShiftKind,
} from '../forecastShifts'
import type { ForecastProbabilityPoint as TimelinePoint } from '../forecastProbabilityTimeline'

function point(date: string, oneDay: number | null, fiveDay: number | null = null): TimelinePoint {
  return { date, oneDay, fiveDay }
}

describe('classifyForecastShift', () => {
  it('detects a flip across the 50% threshold in either direction', () => {
    expect(classifyForecastShift(0.44, 0.58)).toEqual([
      'flip_to_bullish',
      'significant_increase',
    ])
    expect(classifyForecastShift(0.58, 0.44)).toEqual([
      'flip_to_bearish',
      'significant_decrease',
    ])
    expect(classifyForecastShift(0.49, 0.5)).toEqual(['flip_to_bullish'])
    expect(classifyForecastShift(0.5, 0.49)).toEqual(['flip_to_bearish'])
  })

  it('does not treat stays on the same side of 50% as a flip', () => {
    expect(classifyForecastShift(0.51, 0.55)).not.toContain('flip_to_bullish')
    expect(classifyForecastShift(0.51, 0.55)).not.toContain('flip_to_bearish')
    expect(classifyForecastShift(0.5, 0.6)).toEqual(['significant_increase'])
    expect(classifyForecastShift(0.5, 0.5)).toEqual([])
  })

  it('flags significant magnitude moves at the 10 pp threshold', () => {
    expect(SIGNIFICANT_FORECAST_SHIFT).toBe(0.1)
    expect(SIGNIFICANT_FORECAST_SHIFT_PP).toBe(10)
    expect(classifyForecastShift(0.55, 0.65)).toEqual(['significant_increase'])
    expect(classifyForecastShift(0.65, 0.55)).toEqual(['significant_decrease'])
    expect(classifyForecastShift(0.55, 0.649)).toEqual([])
    expect(classifyForecastShift(0.3, 0.45)).toEqual(['significant_increase'])
  })

  it('ignores ordinary small wiggles and invalid values', () => {
    expect(classifyForecastShift(0.56, 0.58)).toEqual([])
    expect(classifyForecastShift(0.62, 0.57)).toEqual([])
    expect(classifyForecastShift(Number.NaN, 0.6)).toEqual([])
    expect(classifyForecastShift(0.6, Number.POSITIVE_INFINITY)).toEqual([])
  })
})

describe('detectForecastShifts', () => {
  it('compares consecutive non-null points per horizon and skips gaps', () => {
    const points: TimelinePoint[] = [
      point('2024-09-10', 0.4, null),
      point('2024-09-11', null, 0.61),
      point('2024-09-12', 0.58, null),
      point('2024-09-16', 0.59, 0.48),
    ]

    const shifts = detectForecastShifts(points)

    expect(shifts).toHaveLength(2)
    expect(shifts[0]).toMatchObject({
      date: '2024-09-12',
      previousDate: '2024-09-10',
      horizon: 'oneDay',
      kinds: ['flip_to_bullish', 'significant_increase'],
    })
    expect(shifts[1]).toMatchObject({
      date: '2024-09-16',
      previousDate: '2024-09-11',
      horizon: 'fiveDay',
      kinds: ['flip_to_bearish', 'significant_decrease'],
    })
  })

  it('does not mark the first observation or a single-point series', () => {
    expect(detectForecastShifts([point('2024-09-16', 0.2, 0.8)])).toEqual([])
    expect(detectForecastShifts([])).toEqual([])
  })

  it('leaves small consecutive moves unmarked on both horizons', () => {
    const points = [
      point('2024-09-10', 0.56, 0.54),
      point('2024-09-11', 0.58, 0.53),
      point('2024-09-12', 0.57, 0.55),
    ]
    expect(detectForecastShifts(points)).toEqual([])
  })

  it('finds the demo 1-day flip onto the current forecast and skips a sub-threshold dip', () => {
    const { points } = buildForecastProbabilityTimeline(demoForecast, demoHistory.records)
    const shifts = detectForecastShifts(points)
    const byKey = indexForecastShifts(shifts)

    expect(byKey.get('oneDay:2024-09-16')).toMatchObject({
      previousDate: '2024-09-13',
      kinds: ['flip_to_bullish', 'significant_increase'],
      previousProbUp: 0.44,
      currentProbUp: 0.58,
    })
    expect(byKey.get('oneDay:2024-09-16')?.changePp).toBeCloseTo(14, 5)

    // 0.66 → 0.58 is 8 pp and stays bullish — not a meaningful shift.
    expect(byKey.has('oneDay:2024-09-12')).toBe(false)
    expect(shifts.some((shift) => shift.horizon === 'fiveDay')).toBe(false)
  })
})

describe('describeForecastShift and primary kind', () => {
  it('prefers a directional flip over a magnitude label', () => {
    expect(
      primaryForecastShiftKind(['flip_to_bullish', 'significant_increase']),
    ).toBe('flip_to_bullish')
    expect(
      describeForecastShift({
        date: '2024-09-16',
        previousDate: '2024-09-13',
        horizon: 'oneDay',
        kinds: ['flip_to_bullish', 'significant_increase'],
        previousProbUp: 0.44,
        currentProbUp: 0.58,
        changePp: 14,
      }),
    ).toBe('1-day flipped bullish across 50% (+14.0 pp)')
  })

  it('describes magnitude-only moves without implying a market call', () => {
    expect(
      describeForecastShift({
        date: '2024-09-05',
        previousDate: '2024-09-04',
        horizon: 'fiveDay',
        kinds: ['significant_decrease'],
        previousProbUp: 0.71,
        currentProbUp: 0.58,
        changePp: -13,
      }),
    ).toBe('5-day fell significantly (-13.0 pp)')
  })
})
