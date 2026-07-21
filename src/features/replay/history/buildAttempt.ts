import type { ReplayHorizonOutcome } from '../api/types'
import type { LockedReplayPrediction } from '../utils/prediction'
import { brierScore } from './scoring'
import type { ReplayAttempt } from './types'

export function createAttemptId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to timestamp-based id.
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface BuildAttemptInput {
  id: string
  replayDate: string
  prediction: LockedReplayPrediction
  outcome: ReplayHorizonOutcome
  completedAt?: string
}

/** Build a completed history attempt from a locked prediction and reveal outcome. */
export function buildReplayAttempt(input: BuildAttemptInput): ReplayAttempt {
  const { id, replayDate, prediction, outcome } = input
  const userCorrect = prediction.direction === outcome.direction_actual
  return {
    id,
    replayDate,
    horizon: prediction.horizon,
    userDirection: prediction.direction,
    userConfidence: prediction.confidence,
    userProbUp: prediction.probUp,
    modelProbUp: outcome.prob_up,
    modelDirection: outcome.direction_predicted,
    actualDirection: outcome.direction_actual,
    realizedReturn: outcome.realized_return,
    userCorrect,
    modelCorrect: outcome.correct,
    brierScore: brierScore(prediction.probUp, outcome.direction_actual),
    completedAt: input.completedAt ?? new Date().toISOString(),
  }
}
