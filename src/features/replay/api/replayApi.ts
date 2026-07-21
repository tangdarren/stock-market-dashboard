import { apiClient } from '@/lib/api/client'
import type { ReplayResultResponse, ReplaySessionResponse } from './types'

export const replayApi = {
  session: (date: string, options: { signal?: AbortSignal } = {}) =>
    apiClient.get<ReplaySessionResponse>('/replay/spy/session', {
      query: { date },
      signal: options.signal,
    }),

  randomSession: (options: { signal?: AbortSignal } = {}) =>
    apiClient.get<ReplaySessionResponse>('/replay/spy/random', {
      signal: options.signal,
    }),

  /**
   * Reveal payload for a completed prediction workflow.
   * Callers should keep this disabled until the learner reveals.
   */
  result: (date: string, options: { signal?: AbortSignal } = {}) =>
    apiClient.get<ReplayResultResponse>('/replay/spy/result', {
      query: { date },
      signal: options.signal,
    }),
}
