import { useQuery } from '@tanstack/react-query'
import { ENV } from '@/lib/api/env'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { modelMonitorApi } from '../api/modelMonitorApi'
import type {
  ModelMonitoringQuery,
  ModelMonitoringResponse,
} from '../api/types'
import { demoModelMonitoring } from '../demo/demoResponses'
import { modelMonitorQueryKeys } from './queryKeys'

const FIVE_MINUTES = 5 * 60 * 1000

export function useModelMonitoring(query: ModelMonitoringQuery) {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<ModelMonitoringResponse>({
    queryKey: modelMonitorQueryKeys.monitoring(
      query.horizon,
      query.window,
      ENV.DEMO_MODE,
      simulated,
    ),
    queryFn: async () => {
      if (ENV.DEMO_MODE) {
        return demoModelMonitoring(query.horizon, query.window)
      }
      return modelMonitorApi.monitoring({ ...query, simulated })
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
