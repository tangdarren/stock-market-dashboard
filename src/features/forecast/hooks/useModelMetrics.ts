import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoMetrics } from '../demo/demoResponses'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { ENV } from '@/lib/api/env'
import type { MetricsResponse } from '../api/types'

export function useModelMetrics() {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<MetricsResponse>({
    queryKey: ['forecast-metrics', ENV.DEMO_MODE, simulated],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoMetrics
      return forecastApi.metrics({ simulated })
    },
    staleTime: Infinity,
    refetchInterval: false,
    retry: 0,
  })
}
