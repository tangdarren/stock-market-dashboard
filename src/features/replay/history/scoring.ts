import type { ReplayDirection } from '../api/types'
import type { ReplayAttempt, ReplayPerformanceSummary } from './types'

/**
 * Binary Brier score for an upward-probability forecast.
 *
 * Actual up → target 1; actual down → target 0.
 * Score = (userProbabilityUp - actualTarget)². Lower is better.
 */
export function brierScore(
  userProbabilityUp: number,
  actualDirection: ReplayDirection,
): number {
  const target = actualDirection === 'up' ? 1 : 0
  const p = clampUnit(userProbabilityUp)
  const score = (p - target) ** 2
  return Math.round(score * 1_000_000) / 1_000_000
}

export function actualTarget(actualDirection: ReplayDirection): 0 | 1 {
  return actualDirection === 'up' ? 1 : 0
}

/** Directional accuracy in [0, 1], or null when there are no attempts. */
export function directionalAccuracy(
  attempts: readonly ReplayAttempt[],
  whose: 'user' | 'model',
): number | null {
  if (attempts.length === 0) return null
  const correct = attempts.reduce((count, attempt) => {
    const hit = whose === 'user' ? attempt.userCorrect : attempt.modelCorrect
    return count + (hit ? 1 : 0)
  }, 0)
  return correct / attempts.length
}

export function averageBrierScore(attempts: readonly ReplayAttempt[]): number | null {
  if (attempts.length === 0) return null
  const sum = attempts.reduce((total, attempt) => total + attempt.brierScore, 0)
  return Math.round((sum / attempts.length) * 1_000_000) / 1_000_000
}

/**
 * Chronological streak helpers. Attempts are sorted ascending by completedAt
 * (then id) before measuring runs of consecutive userCorrect values.
 */
export function streakStats(attempts: readonly ReplayAttempt[]): {
  currentStreak: number
  bestStreak: number
} {
  if (attempts.length === 0) return { currentStreak: 0, bestStreak: 0 }

  const ordered = sortAttemptsChronologically(attempts)
  let best = 0
  let run = 0
  for (const attempt of ordered) {
    if (attempt.userCorrect) {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }

  let current = 0
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (!ordered[i].userCorrect) break
    current += 1
  }

  return { currentStreak: current, bestStreak: best }
}

export function summarizePerformance(
  attempts: readonly ReplayAttempt[],
): ReplayPerformanceSummary {
  const { currentStreak, bestStreak } = streakStats(attempts)
  return {
    totalAttempts: attempts.length,
    userAccuracy: directionalAccuracy(attempts, 'user'),
    modelAccuracy: directionalAccuracy(attempts, 'model'),
    averageBrierScore: averageBrierScore(attempts),
    currentStreak,
    bestStreak,
  }
}

export function sortAttemptsChronologically(
  attempts: readonly ReplayAttempt[],
): ReplayAttempt[] {
  return [...attempts].sort((a, b) => {
    const byTime = a.completedAt.localeCompare(b.completedAt)
    if (byTime !== 0) return byTime
    return a.id.localeCompare(b.id)
  })
}

/** Newest first. */
export function recentAttempts(
  attempts: readonly ReplayAttempt[],
  limit = 10,
): ReplayAttempt[] {
  return sortAttemptsChronologically(attempts).reverse().slice(0, limit)
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
