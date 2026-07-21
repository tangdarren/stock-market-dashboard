import { describe, expect, it } from 'vitest'
import { impliedProbUp } from '../../utils/prediction'
import {
  actualTarget,
  averageBrierScore,
  brierScore,
  directionalAccuracy,
  streakStats,
  summarizePerformance,
} from '../scoring'
import type { ReplayAttempt } from '../types'

function attempt(
  overrides: Partial<ReplayAttempt> & Pick<ReplayAttempt, 'id' | 'userCorrect'>,
): ReplayAttempt {
  return {
    replayDate: '2024-09-16',
    horizon: 1,
    userDirection: 'up',
    userConfidence: 70,
    userProbUp: 0.7,
    modelProbUp: 0.55,
    modelDirection: 'up',
    actualDirection: 'up',
    realizedReturn: 0.01,
    modelCorrect: true,
    brierScore: 0.09,
    completedAt: '2024-09-16T12:00:00.000Z',
    ...overrides,
  }
}

describe('direction and confidence conversion', () => {
  it('maps directional confidence to implied p(up)', () => {
    expect(impliedProbUp('up', 70)).toBe(0.7)
    expect(impliedProbUp('down', 70)).toBe(0.3)
  })
})

describe('brierScore', () => {
  it('uses target 1 for upward outcomes and 0 for downward', () => {
    expect(actualTarget('up')).toBe(1)
    expect(actualTarget('down')).toBe(0)
  })

  it('equals (p - target)^2', () => {
    // Up forecast at 70% when actual up: (0.7 - 1)^2 = 0.09
    expect(brierScore(0.7, 'up')).toBeCloseTo(0.09)
    // Down forecast implying p(up)=0.3 when actual down: (0.3 - 0)^2 = 0.09
    expect(brierScore(0.3, 'down')).toBeCloseTo(0.09)
    expect(brierScore(1, 'up')).toBe(0)
    expect(brierScore(0, 'down')).toBe(0)
    expect(brierScore(0.5, 'up')).toBeCloseTo(0.25)
  })
})

describe('directionalAccuracy', () => {
  it('returns null with no attempts', () => {
    expect(directionalAccuracy([], 'user')).toBeNull()
    expect(directionalAccuracy([], 'model')).toBeNull()
  })

  it('computes user and model accuracy on the same attempts', () => {
    const attempts = [
      attempt({ id: 'a', userCorrect: true, modelCorrect: true }),
      attempt({ id: 'b', userCorrect: false, modelCorrect: true }),
      attempt({ id: 'c', userCorrect: true, modelCorrect: false }),
      attempt({ id: 'd', userCorrect: false, modelCorrect: false }),
    ]
    expect(directionalAccuracy(attempts, 'user')).toBe(0.5)
    expect(directionalAccuracy(attempts, 'model')).toBe(0.5)
  })
})

describe('streakStats', () => {
  it('returns zeros with no attempts', () => {
    expect(streakStats([])).toEqual({ currentStreak: 0, bestStreak: 0 })
  })

  it('tracks current and best correct-answer streaks chronologically', () => {
    const attempts = [
      attempt({
        id: '1',
        userCorrect: true,
        completedAt: '2024-01-01T00:00:00.000Z',
      }),
      attempt({
        id: '2',
        userCorrect: true,
        completedAt: '2024-01-02T00:00:00.000Z',
      }),
      attempt({
        id: '3',
        userCorrect: false,
        completedAt: '2024-01-03T00:00:00.000Z',
      }),
      attempt({
        id: '4',
        userCorrect: true,
        completedAt: '2024-01-04T00:00:00.000Z',
      }),
      attempt({
        id: '5',
        userCorrect: true,
        completedAt: '2024-01-05T00:00:00.000Z',
      }),
      attempt({
        id: '6',
        userCorrect: true,
        completedAt: '2024-01-06T00:00:00.000Z',
      }),
    ]

    expect(streakStats(attempts)).toEqual({
      currentStreak: 3,
      bestStreak: 3,
    })
  })

  it('resets current streak after an incorrect answer', () => {
    const attempts = [
      attempt({
        id: '1',
        userCorrect: true,
        completedAt: '2024-01-01T00:00:00.000Z',
      }),
      attempt({
        id: '2',
        userCorrect: true,
        completedAt: '2024-01-02T00:00:00.000Z',
      }),
      attempt({
        id: '3',
        userCorrect: false,
        completedAt: '2024-01-03T00:00:00.000Z',
      }),
    ]
    expect(streakStats(attempts)).toEqual({
      currentStreak: 0,
      bestStreak: 2,
    })
  })
})

describe('summarizePerformance', () => {
  it('aggregates totals, accuracy, average Brier, and streaks', () => {
    const attempts = [
      attempt({
        id: '1',
        userCorrect: true,
        modelCorrect: false,
        brierScore: 0.04,
        completedAt: '2024-01-01T00:00:00.000Z',
      }),
      attempt({
        id: '2',
        userCorrect: false,
        modelCorrect: true,
        brierScore: 0.16,
        completedAt: '2024-01-02T00:00:00.000Z',
      }),
    ]

    expect(summarizePerformance(attempts)).toEqual({
      totalAttempts: 2,
      userAccuracy: 0.5,
      modelAccuracy: 0.5,
      averageBrierScore: 0.1,
      currentStreak: 0,
      bestStreak: 1,
    })
    expect(averageBrierScore(attempts)).toBe(0.1)
  })
})
