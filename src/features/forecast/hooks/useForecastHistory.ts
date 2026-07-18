import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoHistory } from '../demo/demoResponses'
import { ENV } from '@/lib/api/env'
import type { ForecastHistoryResponse } from '../api/types'

export function useForecastHistory(limit = 30) {
  return useQuery<ForecastHistoryResponse>({
    queryKey: ['forecast-history', limit, ENV.DEMO_MODE],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoHistory
      return forecastApi.forecastHistory(limit)
    },
    staleTime: Infinity,
    refetchInterval: false,
    retry: 0,
  })
}
