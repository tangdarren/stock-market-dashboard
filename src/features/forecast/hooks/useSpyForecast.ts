import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoForecast } from '../demo/demoResponses'
import { ENV } from '@/lib/api/env'
import type { ForecastResponse } from '../api/types'

const FIVE_MINUTES = 5 * 60 * 1000

export function useSpyForecast() {
  return useQuery<ForecastResponse>({
    queryKey: ['forecast-spy', ENV.DEMO_MODE],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoForecast
      return forecastApi.spyForecast()
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
