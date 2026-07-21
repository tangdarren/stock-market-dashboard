import { useQuery } from '@tanstack/react-query'
import { ENV } from '@/lib/api/env'
import { replayApi } from '../api/replayApi'
import type { ReplayResultResponse } from '../api/types'
import { demoReplayResult } from '../demo/demoResponses'

const ONE_HOUR = 60 * 60 * 1000

/**
 * Fetch the reveal payload for a replay date.
 *
 * Intentionally disabled by default — the prediction workflow must complete
 * before this request is enabled in a later iteration.
 */
export function useReplayResult(
  date: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = Boolean(options.enabled && date)

  return useQuery<ReplayResultResponse>({
    queryKey: ['replay', 'result', date, ENV.DEMO_MODE],
    queryFn: async ({ signal }) => {
      if (!date) {
        throw new Error('Replay result requires a selected date.')
      }
      if (ENV.DEMO_MODE) {
        return { ...demoReplayResult, selected_date: date }
      }
      return replayApi.result(date, { signal })
    },
    enabled,
    staleTime: ONE_HOUR,
    refetchOnWindowFocus: false,
    retry: 0,
  })
}
