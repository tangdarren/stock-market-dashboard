import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoAnalogues } from '../demo/demoResponses'
import { ENV } from '@/lib/api/env'
import type { AnalogueResponse } from '../api/types'

// Analogue results for a completed session are stable: the backend invalidates
// its own cache when a new session closes, and the same payload can be reused
// for the rest of the trading day. A generous stale time avoids background
// refetches while a user reads the page and keeps us well under the Alpha
// Vantage rate ceiling. No polling.
const THIRTY_MINUTES = 30 * 60 * 1000

export function useSpyAnalogues(limit = 5) {
  return useQuery<AnalogueResponse>({
    queryKey: ['forecast-analogues', 'spy', limit, ENV.DEMO_MODE],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoAnalogues
      return forecastApi.spyAnalogues(limit)
    },
    staleTime: THIRTY_MINUTES,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: 0,
  })
}
