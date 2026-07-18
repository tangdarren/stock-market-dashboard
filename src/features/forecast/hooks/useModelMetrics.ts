import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoMetrics } from '../demo/demoResponses'
import { ENV } from '@/lib/api/env'
import type { MetricsResponse } from '../api/types'

export function useModelMetrics() {
  return useQuery<MetricsResponse>({
    queryKey: ['forecast-metrics', ENV.DEMO_MODE],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoMetrics
      return forecastApi.metrics()
    },
    staleTime: Infinity,
    refetchInterval: false,
    retry: 0,
  })
}
