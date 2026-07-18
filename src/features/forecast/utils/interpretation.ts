import type { HorizonForecast } from '../api/types'

export type Lean = 'up' | 'down' | 'neutral'
export type LeanStrength = 'none' | 'slight' | 'moderate' | 'strong'

export interface HorizonOutlook {
  lean: Lean
  strength: LeanStrength
  /**
   * Short verdict phrase, e.g. "Model leans upward" or
   * "No strong directional edge".
   */
  headline: string
  /**
   * Long-form sentence used in the confidence explanation area.
   */
  confidenceCopy: string
  probUp: number
  probDown: number
  /**
   * Peak probability = max(prob_up, 1 - prob_up). Useful for consumers that
   * want to size UI (bar widths, accents) by conviction rather than side.
   */
  peakProb: number
  horizonDays: number
}

const NEUTRAL_MAX = 0.55 // below this, treat as "no strong edge"
const MODERATE_MAX = 0.65 // between 0.55 and 0.65 = moderate lean
// >= 0.65 = strong lean

/** Format a probability as an integer percentage, e.g. `52.8` -> `52.8%`. */
function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}

function horizonNoun(days: number): string {
  return days === 1 ? 'next trading day' : `next ${days} trading sessions`
}

/**
 * Convert a HorizonForecast into a plain-English outlook. Rules are derived
 * only from `prob_up` so we never overstate the model. When the peak
 * probability is close to 50%, we explicitly refuse to pick a side.
 */
export function computeHorizonOutlook(
  forecast: HorizonForecast | null | undefined,
): HorizonOutlook | null {
  if (!forecast) return null
  const probUp = Math.max(0, Math.min(1, forecast.prob_up))
  const probDown = 1 - probUp
  const peakProb = Math.max(probUp, probDown)
  const side: Lean = probUp === probDown ? 'neutral' : probUp > probDown ? 'up' : 'down'
  const horizon = horizonNoun(forecast.horizon_days)

  let lean: Lean
  let strength: LeanStrength
  let headline: string
  let confidenceCopy: string

  if (peakProb < NEUTRAL_MAX) {
    lean = 'neutral'
    strength = 'none'
    headline = 'No strong directional edge'
    confidenceCopy = `Low confidence — probabilities are close to 50% over the ${horizon}.`
  } else if (peakProb < MODERATE_MAX) {
    lean = side
    strength = 'moderate'
    headline = side === 'up' ? 'Model leans upward' : 'Model leans downward'
    confidenceCopy = `Moderate confidence — a ${pct(peakProb)} probability of finishing ${
      side === 'up' ? 'higher' : 'lower'
    } over the ${horizon}.`
  } else {
    lean = side
    strength = 'strong'
    headline =
      side === 'up' ? 'Model leans strongly upward' : 'Model leans strongly downward'
    confidenceCopy = `Higher-conviction reading — a ${pct(peakProb)} probability of finishing ${
      side === 'up' ? 'higher' : 'lower'
    } over the ${horizon}. Treat as informational, not a trade signal.`
  }

  return {
    lean,
    strength,
    headline,
    confidenceCopy,
    probUp,
    probDown,
    peakProb,
    horizonDays: forecast.horizon_days,
  }
}

/**
 * Build a single, concise interpretation sentence that summarizes both the
 * one-day and five-day outlook, or explains the missing pieces truthfully.
 *
 * Deliberately rules-based (no external LLM) — the exact numbers stay tied
 * to the values returned by the backend.
 */
export function buildInterpretationSentence(
  oneDay: HorizonOutlook | null,
  fiveDay: HorizonOutlook | null,
): string {
  if (!oneDay && !fiveDay) {
    return 'The model currently has no forecast to interpret.'
  }
  if (oneDay && !fiveDay) {
    return oneDay.strength === 'none'
      ? 'The model currently shows no strong one-day directional edge.'
      : `The model currently ${
          oneDay.headline.toLowerCase()
        } over the next trading day (${pct(oneDay.peakProb)} probability).`
  }
  if (!oneDay && fiveDay) {
    return fiveDay.strength === 'none'
      ? 'The model currently shows no strong five-session directional edge.'
      : `The model currently ${
          fiveDay.headline.toLowerCase()
        } over the next five trading sessions (${pct(fiveDay.peakProb)} probability).`
  }

  // Both present.
  const a = oneDay as HorizonOutlook
  const b = fiveDay as HorizonOutlook

  if (a.strength === 'none' && b.strength === 'none') {
    return 'The model currently shows no strong one-day or five-session directional edge; probabilities on both horizons sit close to neutral.'
  }
  if (a.strength === 'none') {
    return `The model shows no strong one-day directional edge, with a ${leanAdjective(
      b,
    )} lean over the next five sessions (${pct(b.peakProb)} probability).`
  }
  if (b.strength === 'none') {
    return `The model has a ${leanAdjective(
      a,
    )} lean over the next trading day (${pct(a.peakProb)} probability) and no strong five-session directional edge.`
  }
  return `The model has a ${leanAdjective(a)} lean over the next trading day (${pct(
    a.peakProb,
  )} probability) and a ${leanAdjective(b)} lean over the next five sessions (${pct(
    b.peakProb,
  )} probability).`
}

function leanAdjective(o: HorizonOutlook): string {
  const strengthWord =
    o.strength === 'strong' ? 'strongly ' : o.strength === 'moderate' ? 'slightly ' : ''
  const side = o.lean === 'up' ? 'upward' : 'downward'
  return `${strengthWord}${side}`
}
