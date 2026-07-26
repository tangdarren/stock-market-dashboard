import type { ReplayDirection } from '../api/types'

/** Forecast horizon in trading sessions. */
export type ReplayForecastHorizon = 1 | 5

/** Explicit learner workflow steps for Market Replay Lab. */
export type ReplayWorkflowPhase =
  | 'reviewing'
  | 'configuring'
  | 'locked'
  | 'revealed'

export interface ReplayPredictionDraft {
  horizon: ReplayForecastHorizon | null
  direction: ReplayDirection | null
  /** Integer percent in [50, 100]. Defaults to CONFIDENCE_MIN. */
  confidence: number | null
}

export interface LockedReplayPrediction {
  horizon: ReplayForecastHorizon
  direction: ReplayDirection
  confidence: number
  /** Implied probability of an upward outcome in [0, 1]. */
  probUp: number
}

export const CONFIDENCE_MIN = 50
export const CONFIDENCE_MAX = 100

export const EMPTY_PREDICTION_DRAFT: ReplayPredictionDraft = {
  horizon: null,
  direction: null,
  confidence: CONFIDENCE_MIN,
}

/**
 * Convert a directional forecast + confidence into p(up).
 *
 * Up at 70% → 0.70; Down at 70% → 0.30.
 */
export function impliedProbUp(
  direction: ReplayDirection,
  confidencePercent: number,
): number {
  const clamped = clampConfidence(confidencePercent)
  const conf = clamped / 100
  const prob = direction === 'up' ? conf : 1 - conf
  // Avoid binary floating noise (e.g. 1 - 0.7 → 0.30000000000000004).
  return Math.round(prob * 1000) / 1000
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return CONFIDENCE_MIN
  return Math.min(CONFIDENCE_MAX, Math.max(CONFIDENCE_MIN, Math.round(value)))
}

export function isPredictionComplete(
  draft: ReplayPredictionDraft,
): draft is {
  horizon: ReplayForecastHorizon
  direction: ReplayDirection
  confidence: number
} {
  return (
    draft.horizon != null &&
    draft.direction != null &&
    draft.confidence != null &&
    draft.confidence >= CONFIDENCE_MIN &&
    draft.confidence <= CONFIDENCE_MAX
  )
}

export function lockPrediction(draft: ReplayPredictionDraft): LockedReplayPrediction | null {
  if (!isPredictionComplete(draft)) return null
  return {
    horizon: draft.horizon,
    direction: draft.direction,
    confidence: draft.confidence,
    probUp: impliedProbUp(draft.direction, draft.confidence),
  }
}

export function horizonLabel(horizon: ReplayForecastHorizon): string {
  return horizon === 1 ? 'One trading session' : 'Five trading sessions'
}

export function directionLabel(direction: ReplayDirection): string {
  return direction === 'up' ? 'Up' : 'Down'
}
