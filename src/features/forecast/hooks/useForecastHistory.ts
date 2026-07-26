import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoHistory } from '../demo/demoResponses'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { ENV } from '@/lib/api/env'
import type { ForecastHistoryResponse } from '../api/types'

export function useForecastHistory(limit = 30) {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<ForecastHistoryResponse>({
    queryKey: ['forecast-history', limit, ENV.DEMO_MODE, simulated],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoHistory
      return forecastApi.forecastHistory(limit, { simulated })
    },
    staleTime: Infinity,
    refetchInterval: false,
    retry: 0,
  })
}
