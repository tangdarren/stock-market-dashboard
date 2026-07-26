import { useQuery } from '@tanstack/react-query'
import { ENV } from '@/lib/api/env'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { replayApi } from '../api/replayApi'
import type { ReplayResultResponse } from '../api/types'
import { demoReplayResult } from '../demo/demoResponses'

const ONE_HOUR = 60 * 60 * 1000

/**
 * Fetch the reveal payload for a replay date.
 *
 * Keep `enabled` false until the learner deliberately reveals the outcome.
 * Locking a prediction alone must not trigger this request.
 */
export function useReplayResult(
  date: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(options.enabled && date)
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<ReplayResultResponse>({
    queryKey: ['replay', 'result', date, ENV.DEMO_MODE, simulated],
    queryFn: async ({ signal }) => {
      if (!date) {
        throw new Error('Replay result requires a selected date.')
      }
      if (ENV.DEMO_MODE) {
        return { ...demoReplayResult, selected_date: date }
      }
      return replayApi.result(date, { signal, simulated })
    },
    enabled,
    staleTime: ONE_HOUR,
    refetchOnWindowFocus: false,
    retry: 0,
  })
}
