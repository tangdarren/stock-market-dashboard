import type { ForecastProbabilityPoint } from './forecastProbabilityTimeline'
import type { ForecastShiftHorizon } from './forecastShifts'

/** How many latest observations to describe as “recent”. */
export const EVOLUTION_RECENT_COUNT = 5

/** Net move (percentage points) needed to call the recent window a trend. */
export const EVOLUTION_TREND_PP = 8

/** Max range (percentage points) treated as a tight, stable band. */
export const EVOLUTION_STABLE_RANGE_PP = 6

export type ForecastEvolutionKind =
  | 'increasingly_bullish'
  | 'increasingly_bearish'
  | 'stable_near_neutral'
  | 'directional_reversal'
  | 'mixed'
  | 'insufficient'

export interface ForecastEvolutionSummary {
  kind: ForecastEvolutionKind
  headline: string
  detail: string
  horizon: ForecastShiftHorizon | null
}

/**
 * Describe recent model-probability behavior from the existing timeline.
 * Educational only — does not claim SPY will continue in that direction.
 */
export function summarizeForecastEvolution(
  points: readonly ForecastProbabilityPoint[],
  options?: { recentCount?: number },
): ForecastEvolutionSummary {
  const recentCount = options?.recentCount ?? EVOLUTION_RECENT_COUNT
  const sorted = points.slice().sort((a, b) => a.date.localeCompare(b.date))
  const primary = pickPrimaryHorizonSeries(sorted)
  if (!primary) {
    return {
      kind: 'insufficient',
      headline: 'Not enough recent forecasts to summarize',
      detail:
        'A short evolution summary needs at least two 1-day or 5-day readings. This is not a market outlook.',
      horizon: null,
    }
  }

  const recent = primary.values.slice(-Math.max(2, recentCount))
  const kind = classifyRecentSeries(recent)
  return {
    kind,
    horizon: primary.horizon,
    headline: headlineFor(kind),
    detail: detailFor(kind, primary.horizon),
  }
}

export function pickPrimaryHorizonSeries(
  points: readonly ForecastProbabilityPoint[],
): { horizon: ForecastShiftHorizon; values: number[] } | null {
  const oneDay = horizonValues(points, 'oneDay')
  if (oneDay.length >= 2) return { horizon: 'oneDay', values: oneDay }
  const fiveDay = horizonValues(points, 'fiveDay')
  if (fiveDay.length >= 2) return { horizon: 'fiveDay', values: fiveDay }
  return null
}

export function horizonValues(
  points: readonly ForecastProbabilityPoint[],
  horizon: ForecastShiftHorizon,
): number[] {
  return points
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => point[horizon])
    .filter((value): value is number => value != null && Number.isFinite(value))
}

function classifyRecentSeries(recent: readonly number[]): ForecastEvolutionKind {
  if (recent.length < 2) return 'insufficient'

  const previous = recent[recent.length - 2]!
  const current = recent[recent.length - 1]!
  const flipped = previous >= 0.5 !== current >= 0.5
  if (flipped) return 'directional_reversal'

  const first = recent[0]!
  const last = recent[recent.length - 1]!
  const netPp = (last - first) * 100
  const rangePp = (Math.max(...recent) - Math.min(...recent)) * 100
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length
  const steps = recent.slice(1).map((value, index) => value - recent[index]!)
  const upSteps = steps.filter((delta) => delta > 1e-8).length
  const downSteps = steps.filter((delta) => delta < -1e-8).length

  if (netPp >= EVOLUTION_TREND_PP - 1e-8 && upSteps >= downSteps) {
    return 'increasingly_bullish'
  }
  if (netPp <= -EVOLUTION_TREND_PP + 1e-8 && downSteps >= upSteps) {
    return 'increasingly_bearish'
  }
  if (rangePp <= EVOLUTION_STABLE_RANGE_PP + 1e-8 && mean >= 0.45 && mean <= 0.55) {
    return 'stable_near_neutral'
  }

  return 'mixed'
}

function horizonCopy(horizon: ForecastShiftHorizon): string {
  return horizon === 'oneDay' ? '1-day' : '5-day'
}

function headlineFor(kind: ForecastEvolutionKind): string {
  switch (kind) {
    case 'increasingly_bullish':
      return 'Increasingly bullish across recent forecasts'
    case 'increasingly_bearish':
      return 'Increasingly bearish across recent forecasts'
    case 'stable_near_neutral':
      return 'Mostly stable near neutral'
    case 'directional_reversal':
      return 'Recent directional reversal'
    case 'mixed':
      return 'No lasting lean in recent forecasts'
    case 'insufficient':
      return 'Not enough recent forecasts to summarize'
  }
}

function detailFor(kind: ForecastEvolutionKind, horizon: ForecastShiftHorizon): string {
  const label = horizonCopy(horizon)
  switch (kind) {
    case 'increasingly_bullish':
      return `The ${label} bullish probability has moved higher over the latest readings. That describes recent model output, not a reason to expect SPY to keep rising.`
    case 'increasingly_bearish':
      return `The ${label} bullish probability has moved lower over the latest readings. That describes recent model output, not a reason to expect SPY to keep falling.`
    case 'stable_near_neutral':
      return `Recent ${label} probabilities have stayed close to 50%, so the model has not shown a lasting lean. Near-even odds are not a forecast that SPY will stay flat.`
    case 'directional_reversal':
      return `The latest ${label} reading crossed back across 50% after the previous outlook. A reversal in model probability is not a prediction that the market will reverse.`
    case 'mixed':
      return `Recent ${label} probabilities have moved without a simple, lasting direction. This is a description of past model output, not a market call.`
    case 'insufficient':
      return 'A short evolution summary needs at least two 1-day or 5-day readings. This is not a market outlook.'
  }
}
