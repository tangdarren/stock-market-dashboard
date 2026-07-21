import type { ReplayResultResponse, ReplaySessionResponse } from '../api/types'

export const DEMO_REPLAY_DATE = '2024-09-16'
const DEMO_PREV = '2024-09-13'

/** Build ~60 weekday bars ending on ``endDate`` (inclusive). */
function buildSeries(endDate: string, count = 60): ReplaySessionResponse['series'] {
  const end = new Date(`${endDate}T12:00:00`)
  const closes: number[] = []
  let price = 540
  for (let i = 0; i < count; i++) {
    price += Math.sin(i / 4) * 0.8 + (i % 7 === 0 ? 1.2 : -0.3)
    closes.push(Number(price.toFixed(2)))
  }

  const dates: string[] = []
  const cursor = new Date(end)
  while (dates.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      dates.unshift(cursor.toISOString().slice(0, 10))
    }
    cursor.setDate(cursor.getDate() - 1)
  }

  return dates.map((date, i) => {
    const close = closes[i]
    return {
      date,
      open: Number((close - 0.55).toFixed(2)),
      high: Number((close + 1.15).toFixed(2)),
      low: Number((close - 1.25).toFixed(2)),
      close,
      volume: 58_000_000 + i * 120_000,
    }
  })
}

const series = buildSeries(DEMO_REPLAY_DATE, 60)
const lastClose = series[series.length - 1]?.close ?? 554.2

export const demoReplaySession: ReplaySessionResponse = {
  available: true,
  symbol: 'SPY',
  selected_date: DEMO_REPLAY_DATE,
  min_eligible_date: '2023-05-01',
  max_eligible_date: DEMO_REPLAY_DATE,
  nearest_eligible_before: DEMO_PREV,
  nearest_eligible_after: null,
  lookback_sessions: 60,
  session_count: series.length,
  series,
  indicators: {
    close: lastClose,
    momentum_5d: 0.012,
    rsi_14: 58.4,
    rolling_vol_20: 0.0081,
    distance_from_sma_20: 0.014,
    opening_gap_pct: 0.0012,
    relative_volume: 1.08,
  },
  horizons: [1, 5],
  mode: 'historical',
  source: 'local_historical_csv',
  methodology: {
    summary:
      'Replay reconstructs the market context available on a completed historical session: roughly 60 prior daily bars plus leakage-safe technical indicators engineered only from prices and volume on or before that date. Model probabilities and realized outcomes are withheld until reveal and are sourced exclusively from the training-time walk-forward evaluation artifact.',
    lookback_sessions: 60,
    min_feature_history: 50,
    horizons: [1, 5],
    prediction_source: 'walk_forward_predictions',
    feature_engineering: 'build_features',
  },
  disclaimer:
    'Market Replay is an educational reconstruction of a historical session. Walk-forward probabilities are out-of-sample evaluation outputs from training time, not live trading signals. Past outcomes do not imply future results.',
  generated_at: `Sample — ${DEMO_REPLAY_DATE}T20:15:00Z`,
}

export const demoReplayResult: ReplayResultResponse = {
  available: true,
  symbol: 'SPY',
  selected_date: DEMO_REPLAY_DATE,
  one_day: {
    horizon_days: 1,
    prob_up: 0.54,
    direction_predicted: 'up',
    realized_return: -0.004,
    direction_actual: 'down',
    predicted: 1,
    actual: 0,
    correct: false,
  },
  five_day: {
    horizon_days: 5,
    prob_up: 0.57,
    direction_predicted: 'up',
    realized_return: 0.011,
    direction_actual: 'up',
    predicted: 1,
    actual: 1,
    correct: true,
  },
  source: 'walk_forward_predictions',
  evaluation_note:
    'This forecast came from out-of-sample walk-forward evaluation during model training, not from a retrospective run of the final trained model.',
  disclaimer:
    'Market Replay is an educational reconstruction of a historical session. Walk-forward probabilities are out-of-sample evaluation outputs from training time, not live trading signals. Past outcomes do not imply future results.',
  mode: 'historical',
  model_version: 'demo',
  model_metadata: {
    holdout_start: '2023-05-01',
    holdout_end: DEMO_REPLAY_DATE,
    model_name_1d: 'logistic_regression',
    model_name_5d: 'logistic_regression',
    evaluation: 'chronological_holdout_walk_forward',
  },
  generated_at: `Sample — ${DEMO_REPLAY_DATE}T20:15:00Z`,
}

export const demoReplayUnavailable: ReplaySessionResponse = {
  ...demoReplaySession,
  available: false,
  mode: 'unavailable',
  series: [],
  session_count: 0,
  indicators: null,
  reason: 'historical_dataset_missing',
  detail: 'Historical dataset is not present.',
}
