import { apiClient } from '@/lib/api/client'
import type { ModelMonitoringQuery, ModelMonitoringResponse } from './types'

export const modelMonitorApi = {
  monitoring: ({ horizon, window }: ModelMonitoringQuery) =>
    apiClient.get<ModelMonitoringResponse>('/model/monitoring', {
      query: { horizon, window },
    }),
}
