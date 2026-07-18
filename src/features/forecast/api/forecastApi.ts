import { apiClient } from '@/lib/api/client'
import type {
  ForecastHistoryResponse,
  ForecastResponse,
  HealthResponse,
  MarketResponse,
  MetricsResponse,
  NewsResponse,
} from './types'

export const forecastApi = {
  health: () => apiClient.get<HealthResponse>('/health'),
  spyMarket: (options: { refresh?: boolean } = {}) =>
    apiClient.get<MarketResponse>('/market/spy', {
      query: { refresh: options.refresh ? 'true' : undefined },
    }),
  spyForecast: () => apiClient.get<ForecastResponse>('/forecasts/spy'),
  forecastHistory: (limit = 30) =>
    apiClient.get<ForecastHistoryResponse>('/forecasts/history', { query: { limit } }),
  metrics: () => apiClient.get<MetricsResponse>('/model/metrics'),
  news: () => apiClient.get<NewsResponse>('/news/spy'),
}
