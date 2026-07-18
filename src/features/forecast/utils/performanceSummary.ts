import type { HorizonMetrics } from '../api/types'

export interface PerformanceSummary {
  /**
   * Human-readable comparison verdict, e.g. "beat every baseline",
   * "matched the strongest baseline", etc. Never overstates the model.
   */
  headline: string
  /** Long-form sentence expanding the headline with actual numbers. */
  body: string
  /** Loose classification used for badge colouring. */
  verdict: 'beats' | 'matches' | 'weak' | 'unknown'
  bestBaselineName: string | null
  bestBaselineAcc: number | null
  modelAcc: number | null
  balancedAccDelta: number | null
}

/**
 * Compare the selected model's holdout accuracy against the strongest
 * baseline. Deliberately conservative: only claim the model "beat" a
 * baseline when the gap is meaningful (>= 1pp on both accuracy AND
 * balanced accuracy). Otherwise report neutrally.
 */
export function buildPerformanceSummary(
  horizon: HorizonMetrics | undefined,
  horizonLabel = 'model',
): PerformanceSummary | null {
  if (!horizon) return null

  const holdout = horizon.holdout
  const baselines = horizon.baselines ?? {}
  const baselineEntries = Object.entries(baselines)
  if (!holdout || baselineEntries.length === 0) {
    return {
      headline: 'Baseline comparison unavailable.',
      body: 'The metrics artifact does not include baseline predictors for this horizon.',
      verdict: 'unknown',
      bestBaselineName: null,
      bestBaselineAcc: null,
      modelAcc: holdout?.accuracy ?? null,
      balancedAccDelta: null,
    }
  }

  const best = baselineEntries.reduce(
    (winner, [name, m]) =>
      m.balanced_accuracy > winner.balanced_accuracy
        ? { name, balanced_accuracy: m.balanced_accuracy, accuracy: m.accuracy }
        : winner,
    {
      name: baselineEntries[0][0],
      balanced_accuracy: baselineEntries[0][1].balanced_accuracy,
      accuracy: baselineEntries[0][1].accuracy,
    },
  )

  const accDelta = holdout.accuracy - best.accuracy
  const balancedDelta = holdout.balanced_accuracy - best.balanced_accuracy

  const beatsAccuracy = accDelta >= 0.01
  const beatsBalanced = balancedDelta >= 0.01
  const withinNoise = Math.abs(balancedDelta) < 0.01

  let verdict: PerformanceSummary['verdict']
  let headline: string
  if (beatsAccuracy && beatsBalanced) {
    verdict = 'beats'
    headline = `Selected ${horizonLabel} outperformed the strongest baseline in the holdout window.`
  } else if (withinNoise) {
    verdict = 'matches'
    headline = `Selected ${horizonLabel} performed similarly to the strongest baseline in the holdout window.`
  } else if (balancedDelta < -0.01) {
    verdict = 'weak'
    headline = `Selected ${horizonLabel} underperformed the strongest baseline in the holdout window.`
  } else {
    verdict = 'matches'
    headline = `Selected ${horizonLabel} was roughly in line with the strongest baseline in the holdout window.`
  }

  const body = [
    `Holdout balanced accuracy ${(holdout.balanced_accuracy * 100).toFixed(1)}%`,
    `vs the best baseline (${prettyBaseline(best.name)}) at ${(best.balanced_accuracy * 100).toFixed(1)}%`,
    `over ${holdout.n_observations} sessions from ${holdout.test_period_start} to ${holdout.test_period_end}.`,
  ].join(' ')

  return {
    headline,
    body,
    verdict,
    bestBaselineName: best.name,
    bestBaselineAcc: best.accuracy,
    modelAcc: holdout.accuracy,
    balancedAccDelta: balancedDelta,
  }
}

function prettyBaseline(name: string): string {
  return name
    .split(/[_\s]+/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}
