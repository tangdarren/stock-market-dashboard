import { apiClient } from '@/lib/api/client'
import { simulatedQueryParam } from '@/features/simulated/useSimulatedDataMode'
import { parseAnalogueResponse } from './analogueSchema'
import type {
  AnalogueResponse,
  ForecastHistoryResponse,
  ForecastResponse,
  HealthResponse,
  MarketResponse,
  MetricsResponse,
  NewsResponse,
} from './types'

export interface SimulatedRequestOptions {
  simulated?: boolean
}

export const forecastApi = {
  health: () => apiClient.get<HealthResponse>('/health'),
  spyMarket: (options: { refresh?: boolean } & SimulatedRequestOptions = {}) =>
    apiClient.get<MarketResponse>('/market/spy', {
      query: {
        refresh: options.refresh ? 'true' : undefined,
        ...simulatedQueryParam(Boolean(options.simulated)),
      },
    }),
  spyForecast: (options: SimulatedRequestOptions = {}) =>
    apiClient.get<ForecastResponse>('/forecasts/spy', {
      query: { ...simulatedQueryParam(Boolean(options.simulated)) },
    }),
  forecastHistory: (limit = 30, options: SimulatedRequestOptions = {}) =>
    apiClient.get<ForecastHistoryResponse>('/forecasts/history', {
      query: { limit, ...simulatedQueryParam(Boolean(options.simulated)) },
    }),
  metrics: (options: SimulatedRequestOptions = {}) =>
    apiClient.get<MetricsResponse>('/model/metrics', {
      query: { ...simulatedQueryParam(Boolean(options.simulated)) },
    }),
  news: (options: SimulatedRequestOptions = {}) =>
    apiClient.get<NewsResponse>('/news/spy', {
      query: { ...simulatedQueryParam(Boolean(options.simulated)) },
    }),
  spyAnalogues: async (
    limit = 5,
    options: SimulatedRequestOptions = {},
  ): Promise<AnalogueResponse> => {
    const raw = await apiClient.get<unknown>('/market/spy/analogues', {
      query: { limit, ...simulatedQueryParam(Boolean(options.simulated)) },
    })
    return parseAnalogueResponse(raw)
  },
}
