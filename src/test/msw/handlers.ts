import { http, HttpResponse } from 'msw'
import { ENV } from '@/lib/api/env'
import {
  demoAnalogues,
  demoForecast,
  demoHistory,
  demoMarket,
  demoMetrics,
  demoNews,
} from '@/features/forecast/demo/demoResponses'

const base = `${ENV.API_BASE_URL}${ENV.API_PREFIX}`

export const successHandlers = [
  http.get(`${base}/health`, () =>
    HttpResponse.json({
      status: 'ok',
      service: 'test',
      version: '0.0.1',
      time: '2024-09-16T20:00:00Z',
      env: 'development',
      alpha_vantage_configured: true,
      market_cache_available: true,
      model_available: true,
    }),
  ),
  http.get(`${base}/market/spy`, () =>
    HttpResponse.json({ ...demoMarket, mode: 'live', source: 'alpha_vantage' }),
  ),
  http.get(`${base}/forecasts/spy`, () =>
    HttpResponse.json({ ...demoForecast, mode: 'live' }),
  ),
  http.get(`${base}/forecasts/history`, () => HttpResponse.json(demoHistory)),
  http.get(`${base}/model/metrics`, () => HttpResponse.json(demoMetrics)),
  http.get(`${base}/news/spy`, () => HttpResponse.json(demoNews)),
  http.get(`${base}/market/spy/analogues`, () =>
    HttpResponse.json({ ...demoAnalogues, mode: 'live', cache_status: 'miss' }),
  ),
]

export const modelUnavailableHandlers = [
  http.get(`${base}/health`, () =>
    HttpResponse.json({
      status: 'ok',
      service: 'test',
      version: '0.0.1',
      time: '2024-09-16T20:00:00Z',
      env: 'development',
      alpha_vantage_configured: true,
      market_cache_available: true,
      model_available: false,
    }),
  ),
  http.get(`${base}/market/spy`, () =>
    HttpResponse.json({ ...demoMarket, mode: 'live', source: 'alpha_vantage' }),
  ),
  http.get(`${base}/forecasts/spy`, () =>
    HttpResponse.json({
      one_day: null,
      five_day: null,
      features_as_of: null,
      data_as_of: null,
      mode: 'model_unavailable',
      is_stale: false,
      disclaimer: 'Model output is probabilistic and may be wrong.',
      model_unavailable: true,
      reason: 'No trained model artifacts.',
    }),
  ),
  http.get(`${base}/forecasts/history`, () =>
    HttpResponse.json({ records: [], count: 0, model_version: null }),
  ),
  http.get(`${base}/model/metrics`, () =>
    HttpResponse.json(
      { detail: { message: 'no artifacts', reason: 'artifacts_missing' } },
      { status: 503 },
    ),
  ),
  http.get(`${base}/news/spy`, () =>
    HttpResponse.json({ available: false, reason: 'no key', note: 'contextual' }),
  ),
  http.get(`${base}/market/spy/analogues`, () =>
    HttpResponse.json({
      available: false,
      symbol: 'SPY',
      query_date: null,
      features_as_of: null,
      data_as_of: null,
      limit: null,
      methodology: {
        method: 'standardized_euclidean_nearest_neighbors',
        features: [],
        minimum_separation_days: 20,
      },
      summary: null,
      analogues: [],
      disclaimer: 'Historical similarity does not imply the same future outcome.',
      mode: 'unavailable',
      cache_status: 'bypass',
      reason: 'historical_dataset_missing',
      detail: 'Historical dataset is not present.',
    }),
  ),
]

export const backendDownHandlers = [
  http.get(`${base}/health`, () => HttpResponse.error()),
  http.get(`${base}/market/spy`, () => HttpResponse.error()),
  http.get(`${base}/forecasts/spy`, () => HttpResponse.error()),
  http.get(`${base}/forecasts/history`, () => HttpResponse.error()),
  http.get(`${base}/model/metrics`, () => HttpResponse.error()),
  http.get(`${base}/news/spy`, () => HttpResponse.error()),
  http.get(`${base}/market/spy/analogues`, () => HttpResponse.error()),
]

export const staleHandlers = [
  http.get(`${base}/health`, () =>
    HttpResponse.json({
      status: 'ok',
      service: 'test',
      version: '0.0.1',
      time: '2024-09-16T20:00:00Z',
      env: 'development',
      alpha_vantage_configured: true,
      market_cache_available: true,
      model_available: true,
    }),
  ),
  http.get(`${base}/market/spy`, () =>
    HttpResponse.json({
      ...demoMarket,
      mode: 'stale',
      is_stale: true,
      cache: { ...demoMarket.cache, cacheStatus: 'stale_fallback', isStale: true },
    }),
  ),
  http.get(`${base}/forecasts/spy`, () =>
    HttpResponse.json({ ...demoForecast, mode: 'stale', is_stale: true }),
  ),
  http.get(`${base}/forecasts/history`, () => HttpResponse.json(demoHistory)),
  http.get(`${base}/model/metrics`, () => HttpResponse.json(demoMetrics)),
  http.get(`${base}/news/spy`, () => HttpResponse.json(demoNews)),
  http.get(`${base}/market/spy/analogues`, () =>
    HttpResponse.json({ ...demoAnalogues, mode: 'stale', cache_status: 'hit' }),
  ),
]

// Default = success.
export const handlers = successHandlers
