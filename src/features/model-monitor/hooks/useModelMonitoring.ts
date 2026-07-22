import { useQuery } from '@tanstack/react-query'
import { ENV } from '@/lib/api/env'
import { modelMonitorApi } from '../api/modelMonitorApi'
import type {
  ModelMonitoringQuery,
  ModelMonitoringResponse,
} from '../api/types'
import { demoModelMonitoring } from '../demo/demoResponses'
import { modelMonitorQueryKeys } from './queryKeys'

const FIVE_MINUTES = 5 * 60 * 1000

export function useModelMonitoring(query: ModelMonitoringQuery) {
  return useQuery<ModelMonitoringResponse>({
    queryKey: modelMonitorQueryKeys.monitoring(
      query.horizon,
      query.window,
      ENV.DEMO_MODE,
    ),
    queryFn: async () => {
      if (ENV.DEMO_MODE) {
        return demoModelMonitoring(query.horizon, query.window)
      }
      return modelMonitorApi.monitoring(query)
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
