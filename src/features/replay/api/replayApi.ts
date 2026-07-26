import { apiClient } from '@/lib/api/client'
import { simulatedQueryParam } from '@/features/simulated/useSimulatedDataMode'
import type { ReplayResultResponse, ReplaySessionResponse } from './types'

export interface ReplayRequestOptions {
  signal?: AbortSignal
  simulated?: boolean
}

export const replayApi = {
  session: (date: string, options: ReplayRequestOptions = {}) =>
    apiClient.get<ReplaySessionResponse>('/replay/spy/session', {
      query: {
        date,
        ...simulatedQueryParam(Boolean(options.simulated)),
      },
      signal: options.signal,
    }),

  randomSession: (options: ReplayRequestOptions = {}) =>
    apiClient.get<ReplaySessionResponse>('/replay/spy/random', {
      query: { ...simulatedQueryParam(Boolean(options.simulated)) },
      signal: options.signal,
    }),

  /**
   * Reveal payload for a completed prediction workflow.
   * Callers should keep this disabled until the learner reveals.
   */
  result: (date: string, options: ReplayRequestOptions = {}) =>
    apiClient.get<ReplayResultResponse>('/replay/spy/result', {
      query: {
        date,
        ...simulatedQueryParam(Boolean(options.simulated)),
      },
      signal: options.signal,
    }),
}
