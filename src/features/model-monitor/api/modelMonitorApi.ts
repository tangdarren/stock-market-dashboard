import { apiClient } from '@/lib/api/client'
import { simulatedQueryParam } from '@/features/simulated/useSimulatedDataMode'
import type { ModelMonitoringQuery, ModelMonitoringResponse } from './types'

export const modelMonitorApi = {
  monitoring: ({
    horizon,
    window,
    simulated = false,
  }: ModelMonitoringQuery & { simulated?: boolean }) =>
    apiClient.get<ModelMonitoringResponse>('/model/monitoring', {
      query: {
        horizon,
        window,
        ...simulatedQueryParam(simulated),
      },
    }),
}
