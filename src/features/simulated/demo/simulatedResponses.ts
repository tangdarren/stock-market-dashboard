/**
 * Shared frontend fixtures for simulated workbook responses.
 * Distinct from demo fixtures (client sample data when the backend is down).
 */

import type {
  AnalogueResponse,
  ForecastHistoryResponse,
  ForecastResponse,
  MarketResponse,
  MetricsResponse,
  NewsResponse,
} from '@/features/forecast/api/types'
import {
  demoAnalogues,
  demoForecast,
  demoHistory,
  demoMarket,
  demoMetrics,
  demoNews,
} from '@/features/forecast/demo/demoResponses'
import type {
  ModelMonitoringResponse,
  MonitoringHorizon,
  MonitoringWindow,
} from '@/features/model-monitor/api/types'
import {
  demoModelMonitoring,
  demoModelMonitoringUnavailable,
} from '@/features/model-monitor/demo/demoResponses'
import type {
  ReplayResultResponse,
  ReplaySessionResponse,
} from '@/features/replay/api/types'
import {
  demoReplayResult,
  demoReplaySession,
} from '@/features/replay/demo/demoResponses'

export const SIMULATED_DATA_DISCLAIMER =
  'Fictional scenario data from the synthetic workbook — not live market feeds or real SPY performance.'

export const SIMULATED_METRICS_DISCLAIMER =
  'These metrics and educational backtest figures are computed from fictional Forecast_History rows. They are scenario results only — not real SPY model performance.'

export const SIMULATED_BACKTEST_DISCLAIMER =
  'Educational fictional scenario simulation from synthetic workbook data. Not real SPY performance. Past fictional outcomes do not imply future results.'

export const SIMULATED_MONITORING_DISCLAIMER =
  'Model monitoring in simulated mode scores fictional Forecast_History and synthetic Market_Data rows. Status bands and drift scores are scenario outputs, not live SPY health.'

export const SIMULATED_REPLAY_DISCLAIMER =
  'Market Replay in simulated mode reconstructs a fictional scenario session from the synthetic workbook. Walk-forward probabilities and realized outcomes are not real SPY history or live trading signals.'

export const SIMULATED_NEWS_NOTE =
  'Simulated news context is fictional scenario copy for UI demonstration. It is not sourced from Alpha Vantage or any live news feed.'

export const simulatedMarket: MarketResponse = {
  ...demoMarket,
  mode: 'simulated',
  source: 'simulated_workbook',
  data_classification: 'SIMULATED / FICTIONAL',
  disclaimer: SIMULATED_DATA_DISCLAIMER,
}

export const simulatedForecast: ForecastResponse = {
  ...demoForecast,
  mode: 'simulated',
  source: 'simulated_workbook',
  data_classification: 'SIMULATED / FICTIONAL',
  disclaimer: SIMULATED_DATA_DISCLAIMER,
}

export const simulatedHistory: ForecastHistoryResponse = {
  ...demoHistory,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_DATA_DISCLAIMER,
}

export const simulatedMetrics: MetricsResponse = {
  ...demoMetrics,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_METRICS_DISCLAIMER,
  horizons: {
    ...demoMetrics.horizons,
    '1d': {
      ...demoMetrics.horizons['1d'],
      backtest: {
        ...demoMetrics.horizons['1d'].backtest,
        disclaimer: SIMULATED_BACKTEST_DISCLAIMER,
      },
    },
  },
}

export const simulatedNews: NewsResponse = {
  ...demoNews,
  mode: 'simulated',
  source: 'simulated_workbook',
  note: SIMULATED_NEWS_NOTE,
  disclaimer: SIMULATED_DATA_DISCLAIMER,
  data_classification: 'SIMULATED / FICTIONAL',
}

export const simulatedAnalogues: AnalogueResponse = {
  ...demoAnalogues,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_DATA_DISCLAIMER,
  data_classification: 'SIMULATED / FICTIONAL',
}

export function simulatedModelMonitoring(
  horizon: MonitoringHorizon = '1d',
  window: MonitoringWindow = 30,
): ModelMonitoringResponse {
  return {
    ...demoModelMonitoring(horizon, window),
    mode: 'simulated',
    source: 'simulated_workbook',
    disclaimer: SIMULATED_MONITORING_DISCLAIMER,
    data_classification: 'SIMULATED / FICTIONAL',
    model_version: 'simulated-scenario',
  }
}

export const simulatedModelMonitoringUnavailable: ModelMonitoringResponse = {
  ...demoModelMonitoringUnavailable,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_MONITORING_DISCLAIMER,
  reason: 'simulated_workbook_missing',
  detail:
    'Simulated monitoring is unavailable because the workbook could not be loaded.',
}

export const simulatedReplaySession: ReplaySessionResponse = {
  ...demoReplaySession,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_REPLAY_DISCLAIMER,
  data_classification: 'SIMULATED / FICTIONAL',
  methodology: {
    ...demoReplaySession.methodology!,
    prediction_source: 'simulated_forecast_history',
  },
}

export const simulatedReplayResult: ReplayResultResponse = {
  ...demoReplayResult,
  mode: 'simulated',
  source: 'simulated_workbook',
  disclaimer: SIMULATED_REPLAY_DISCLAIMER,
  data_classification: 'SIMULATED / FICTIONAL',
  evaluation_note:
    'These probabilities come from the synthetic Forecast_History sheet — fictional scenario results, not out-of-sample evaluation of a model trained on real SPY prices.',
  model_version: 'simulated-scenario',
}
