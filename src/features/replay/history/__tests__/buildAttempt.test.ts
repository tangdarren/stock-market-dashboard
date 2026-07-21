import { describe, expect, it } from 'vitest'
import type { ReplayHorizonOutcome } from '../../api/types'
import type { LockedReplayPrediction } from '../../utils/prediction'
import { buildReplayAttempt } from '../buildAttempt'
import { brierScore } from '../scoring'

describe('buildReplayAttempt', () => {
  it('captures prediction, model, actuals, correctness, and Brier score', () => {
    const prediction: LockedReplayPrediction = {
      horizon: 5,
      direction: 'down',
      confidence: 70,
      probUp: 0.3,
    }
    const outcome: ReplayHorizonOutcome = {
      horizon_days: 5,
      prob_up: 0.57,
      direction_predicted: 'up',
      realized_return: 0.011,
      direction_actual: 'up',
      predicted: 1,
      actual: 1,
      correct: true,
    }

    const attempt = buildReplayAttempt({
      id: 'reveal-abc',
      replayDate: '2024-09-16',
      prediction,
      outcome,
      completedAt: '2024-09-16T21:00:00.000Z',
    })

    expect(attempt).toEqual({
      id: 'reveal-abc',
      replayDate: '2024-09-16',
      horizon: 5,
      userDirection: 'down',
      userConfidence: 70,
      userProbUp: 0.3,
      modelProbUp: 0.57,
      modelDirection: 'up',
      actualDirection: 'up',
      realizedReturn: 0.011,
      userCorrect: false,
      modelCorrect: true,
      brierScore: brierScore(0.3, 'up'),
      completedAt: '2024-09-16T21:00:00.000Z',
    })
  })
})
