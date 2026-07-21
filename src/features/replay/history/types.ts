import type { ReplayDirection } from '../api/types'
import type { ReplayForecastHorizon } from '../utils/prediction'

/** localStorage key for versioned replay history. */
export const REPLAY_HISTORY_STORAGE_KEY = 'spy-replay-history:v1'

/** Schema version stored inside the payload. */
export const REPLAY_HISTORY_SCHEMA_VERSION = 1 as const

export interface ReplayAttempt {
  id: string
  replayDate: string
  horizon: ReplayForecastHorizon
  userDirection: ReplayDirection
  /** Integer percent in [50, 100]. */
  userConfidence: number
  /** Implied p(up) in [0, 1]. */
  userProbUp: number
  modelProbUp: number
  modelDirection: ReplayDirection
  actualDirection: ReplayDirection
  realizedReturn: number
  userCorrect: boolean
  modelCorrect: boolean
  /** Binary Brier score; lower is better. */
  brierScore: number
  /** ISO-8601 completion timestamp. */
  completedAt: string
}

export interface ReplayHistoryPayload {
  version: typeof REPLAY_HISTORY_SCHEMA_VERSION
  attempts: ReplayAttempt[]
}

export interface ReplayPerformanceSummary {
  totalAttempts: number
  userAccuracy: number | null
  modelAccuracy: number | null
  averageBrierScore: number | null
  currentStreak: number
  bestStreak: number
}

export type AppendAttemptResult =
  | { status: 'added'; attempt: ReplayAttempt; history: ReplayHistoryPayload }
  | { status: 'duplicate'; attempt: ReplayAttempt; history: ReplayHistoryPayload }
  | { status: 'invalid'; history: ReplayHistoryPayload }
