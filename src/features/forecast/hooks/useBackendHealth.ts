import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { ENV } from '@/lib/api/env'
import type { HealthResponse } from '../api/types'

export function useBackendHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['forecast-health', ENV.DEMO_MODE],
    queryFn: async () => forecastApi.health(),
    enabled: !ENV.DEMO_MODE,
    retry: 0,
    staleTime: 60_000,
    refetchInterval: false,
  })
}
