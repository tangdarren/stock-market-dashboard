import { useQuery } from '@tanstack/react-query'
import { ENV } from '@/lib/api/env'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { replayApi } from '../api/replayApi'
import type { ReplaySessionRequest, ReplaySessionResponse } from '../api/types'
import { demoReplaySession } from '../demo/demoResponses'

// Historical sessions are immutable; cache aggressively and avoid background churn.
const ONE_HOUR = 60 * 60 * 1000

export function useReplaySession(request: ReplaySessionRequest | null) {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<ReplaySessionResponse>({
    queryKey: ['replay', 'session', request, ENV.DEMO_MODE, simulated],
    queryFn: async ({ signal }) => {
      if (!request) {
        throw new Error('Replay session request is required.')
      }
      if (ENV.DEMO_MODE) {
        if (request.kind === 'date') {
          return {
            ...demoReplaySession,
            selected_date: request.date,
            series: demoReplaySession.series.map((bar, index, arr) =>
              index === arr.length - 1 ? { ...bar, date: request.date } : bar,
            ),
          }
        }
        return demoReplaySession
      }
      if (request.kind === 'random') {
        return replayApi.randomSession({ signal, simulated })
      }
      return replayApi.session(request.date, { signal, simulated })
    },
    enabled: request !== null,
    staleTime: ONE_HOUR,
    refetchOnWindowFocus: false,
    retry: 0,
  })
}
