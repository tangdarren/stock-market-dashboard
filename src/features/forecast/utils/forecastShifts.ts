import type { ForecastProbabilityPoint } from './forecastProbabilityTimeline'

/** Absolute probability move (fraction) treated as a significant increase or decrease. */
export const SIGNIFICANT_FORECAST_SHIFT = 0.1

/** Same threshold in percentage points, for captions and tests. */
export const SIGNIFICANT_FORECAST_SHIFT_PP = SIGNIFICANT_FORECAST_SHIFT * 100

export type ForecastShiftHorizon = 'oneDay' | 'fiveDay'

export type ForecastShiftKind =
  | 'flip_to_bullish'
  | 'flip_to_bearish'
  | 'significant_increase'
  | 'significant_decrease'

export interface ForecastShift {
  date: string
  previousDate: string
  horizon: ForecastShiftHorizon
  kinds: ForecastShiftKind[]
  previousProbUp: number
  currentProbUp: number
  /** Current minus previous, in percentage points. */
  changePp: number
}

export interface ClassifyForecastShiftOptions {
  /** Override the significant-move threshold (fraction in [0, 1]). */
  significantChange?: number
}

/**
 * Classify a single consecutive forecast pair. A directional flip across 50%
 * and a large magnitude move can both apply to the same step.
 */
export function classifyForecastShift(
  previousProbUp: number,
  currentProbUp: number,
  options?: ClassifyForecastShiftOptions,
): ForecastShiftKind[] {
  if (!Number.isFinite(previousProbUp) || !Number.isFinite(currentProbUp)) {
    return []
  }

  const previous = clamp01(previousProbUp)
  const current = clamp01(currentProbUp)
  const thresholdPp =
    (options?.significantChange ?? SIGNIFICANT_FORECAST_SHIFT) * 100
  const kinds: ForecastShiftKind[] = []

  const previousBullish = previous >= 0.5
  const currentBullish = current >= 0.5
  if (previousBullish !== currentBullish) {
    kinds.push(currentBullish ? 'flip_to_bullish' : 'flip_to_bearish')
  }

  // Compare in percentage points so 0.55 → 0.65 is treated as exactly 10 pp
  // despite binary floating-point error on the raw fraction.
  const changePp = (current - previous) * 100
  if (changePp >= thresholdPp - 1e-8) kinds.push('significant_increase')
  else if (changePp <= -thresholdPp + 1e-8) kinds.push('significant_decrease')

  return kinds
}

/**
 * Find meaningful consecutive-forecast events on a date-aligned probability
 * timeline. Each horizon is compared only to its own previous non-null value,
 * so sparse 5-day history is not compared against empty dates.
 */
export function detectForecastShifts(
  points: readonly ForecastProbabilityPoint[],
  options?: ClassifyForecastShiftOptions,
): ForecastShift[] {
  if (points.length < 2) return []

  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  const shifts: ForecastShift[] = []

  for (const horizon of ['oneDay', 'fiveDay'] as const) {
    let previous: ForecastProbabilityPoint | null = null
    for (const point of sorted) {
      const currentProb = point[horizon]
      if (currentProb == null) continue

      const previousProb = previous?.[horizon]
      if (previous && previousProb != null) {
        const kinds = classifyForecastShift(previousProb, currentProb, options)
        if (kinds.length > 0) {
          shifts.push({
            date: point.date,
            previousDate: previous.date,
            horizon,
            kinds,
            previousProbUp: previousProb,
            currentProbUp: currentProb,
            changePp: (currentProb - previousProb) * 100,
          })
        }
      }

      previous = point
    }
  }

  return shifts
}

export function forecastShiftKey(horizon: ForecastShiftHorizon, date: string): string {
  return `${horizon}:${date}`
}

export function indexForecastShifts(
  shifts: readonly ForecastShift[],
): Map<string, ForecastShift> {
  const index = new Map<string, ForecastShift>()
  for (const shift of shifts) {
    index.set(forecastShiftKey(shift.horizon, shift.date), shift)
  }
  return index
}

export function primaryForecastShiftKind(
  kinds: readonly ForecastShiftKind[],
): ForecastShiftKind | null {
  if (kinds.includes('flip_to_bullish')) return 'flip_to_bullish'
  if (kinds.includes('flip_to_bearish')) return 'flip_to_bearish'
  if (kinds.includes('significant_increase')) return 'significant_increase'
  if (kinds.includes('significant_decrease')) return 'significant_decrease'
  return null
}

export function isDirectionalFlip(kinds: readonly ForecastShiftKind[]): boolean {
  return kinds.includes('flip_to_bullish') || kinds.includes('flip_to_bearish')
}

export function describeForecastShift(shift: ForecastShift): string {
  const horizon = shift.horizon === 'oneDay' ? '1-day' : '5-day'
  const pp = formatShiftChangePp(shift.changePp)
  switch (primaryForecastShiftKind(shift.kinds)) {
    case 'flip_to_bullish':
      return `${horizon} flipped bullish across 50% (${pp})`
    case 'flip_to_bearish':
      return `${horizon} flipped bearish across 50% (${pp})`
    case 'significant_increase':
      return `${horizon} rose significantly (${pp})`
    case 'significant_decrease':
      return `${horizon} fell significantly (${pp})`
    default:
      return `${horizon} changed (${pp})`
  }
}

export function formatShiftChangePp(pp: number): string {
  if (!Number.isFinite(pp)) return '—'
  const sign = pp > 0 ? '+' : ''
  return `${sign}${pp.toFixed(1)} pp`
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
