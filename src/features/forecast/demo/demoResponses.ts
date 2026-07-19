import type {
  AnalogueResponse,
  ForecastHistoryResponse,
  ForecastResponse,
  MarketResponse,
  MetricsResponse,
  NewsResponse,
} from '../api/types'

/**
 * Demo payloads for offline / no-backend usage.
 *
 * Correction #8: every timestamp is a fixed sentinel date. No `now`, `today`,
 * or `current` copy. Every panel that consumes these renders a "Demo data"
 * badge so the user is never misled into thinking anything here is live.
 */

const DEMO_DATE = '2024-09-16'
const DEMO_PREV = '2024-09-13'

function buildSeries(): MarketResponse['series'] {
  const closes = [
    535.2, 536.1, 534.7, 537.4, 538.9, 540.1, 539.3, 541.5, 543.0, 542.4, 544.8, 546.1, 545.2,
    547.8, 549.1, 548.4, 550.7, 552.3, 551.9, 554.2, 553.1, 555.9, 557.2, 556.4, 558.7, 560.1,
    559.3, 561.2, 562.8, 561.0,
  ]
  const start = new Date('2024-08-05')
  return closes.map((close, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    return {
      date: iso,
      open: close - 0.6,
      high: close + 1.1,
      low: close - 1.2,
      close,
      volume: 60_000_000 + i * 100_000,
    }
  })
}

const _demoSeries = buildSeries()
const _latest = _demoSeries[_demoSeries.length - 1]
const _previous = _demoSeries[_demoSeries.length - 2]

export const demoMarket: MarketResponse = {
  series: _demoSeries,
  latest: _latest,
  previous: _previous,
  change: _latest.close - _previous.close,
  change_percent: ((_latest.close - _previous.close) / _previous.close) * 100,
  features_as_of: DEMO_DATE,
  data_as_of: DEMO_DATE,
  target_session: DEMO_DATE,
  source: 'demo_fixture',
  mode: 'demo',
  is_stale: false,
  cache: { fetchedAt: `Sample — ${DEMO_DATE}T20:15:00Z`, cacheStatus: 'demo', isStale: false },
}

export const demoForecast: ForecastResponse = {
  one_day: {
    horizon_days: 1,
    prob_up: 0.58,
    prob_down: 0.42,
    direction: 'up',
    confidence: 'moderate',
    model_name: 'hist_gradient_boosting',
    trained_at: `Sample — ${DEMO_PREV}T00:00:00Z`,
    features_as_of: DEMO_DATE,
    explanations: {
      method: 'permutation_importance_x_context',
      up: [
        {
          label: 'distance_from_sma_20',
          feature: 'distance_from_sma_20',
          value: 0.014,
          direction: 'up',
          contribution: 0.031,
          plain_english: 'SPY is trading above its 20-day moving average.',
        },
        {
          label: 'return_5d',
          feature: 'return_5d',
          value: 0.011,
          direction: 'up',
          contribution: 0.024,
          plain_english: 'The five-day trend is positive.',
        },
      ],
      down: [
        {
          label: 'rolling_vol_20',
          feature: 'rolling_vol_20',
          value: 0.012,
          direction: 'down',
          contribution: -0.018,
          plain_english: '20-day realized volatility is elevated.',
        },
      ],
      uncertainty: [
        {
          label: 'volume_zscore_20',
          feature: 'volume_zscore_20',
          value: -0.15,
          direction: 'uncertainty',
          contribution: 0.002,
          plain_english: 'volume_zscore_20 is near its recent typical level; only weak signal.',
        },
      ],
    },
  },
  five_day: {
    horizon_days: 5,
    prob_up: 0.54,
    prob_down: 0.46,
    direction: 'up',
    confidence: 'low',
    model_name: 'logistic_regression',
    trained_at: `Sample — ${DEMO_PREV}T00:00:00Z`,
    features_as_of: DEMO_DATE,
    explanations: {
      method: 'logistic_regression_contribution',
      up: [
        {
          label: 'macd',
          feature: 'macd',
          value: 0.0031,
          direction: 'up',
          contribution: 0.11,
          plain_english: 'MACD is positive (short EMA above long EMA).',
        },
      ],
      down: [
        {
          label: 'opening_gap_pct',
          feature: 'opening_gap_pct',
          value: -0.002,
          direction: 'down',
          contribution: -0.05,
          plain_english: 'SPY opened with a downside gap.',
        },
      ],
      uncertainty: [],
    },
  },
  features_as_of: DEMO_DATE,
  data_as_of: DEMO_DATE,
  mode: 'demo',
  is_stale: false,
  disclaimer: 'Model output is probabilistic and may be wrong. It is not financial advice.',
  model_unavailable: false,
  model_version: 'demo-v1',
}

export const demoHistory: ForecastHistoryResponse = {
  count: 12,
  model_version: 'demo-v1',
  records: [
    { date: '2024-08-30', horizon_days: 1, prob_up: 0.62, predicted: 1, actual: 1, correct: 1, realized_return: 0.0041 },
    { date: '2024-09-03', horizon_days: 1, prob_up: 0.49, predicted: 0, actual: 0, correct: 1, realized_return: -0.0022 },
    { date: '2024-09-04', horizon_days: 1, prob_up: 0.55, predicted: 1, actual: 0, correct: 0, realized_return: -0.0015 },
    { date: '2024-09-05', horizon_days: 1, prob_up: 0.71, predicted: 1, actual: 1, correct: 1, realized_return: 0.0067 },
    { date: '2024-09-06', horizon_days: 1, prob_up: 0.48, predicted: 0, actual: 1, correct: 0, realized_return: 0.0012 },
    { date: '2024-09-09', horizon_days: 1, prob_up: 0.63, predicted: 1, actual: 1, correct: 1, realized_return: 0.0055 },
    { date: '2024-09-10', horizon_days: 1, prob_up: 0.52, predicted: 1, actual: 0, correct: 0, realized_return: -0.0031 },
    { date: '2024-09-11', horizon_days: 1, prob_up: 0.66, predicted: 1, actual: 1, correct: 1, realized_return: 0.0044 },
    { date: '2024-09-12', horizon_days: 1, prob_up: 0.58, predicted: 1, actual: 1, correct: 1, realized_return: 0.0038 },
    { date: '2024-09-13', horizon_days: 1, prob_up: 0.44, predicted: 0, actual: 0, correct: 1, realized_return: -0.0027 },
    { date: '2024-09-16', horizon_days: 1, prob_up: 0.58, predicted: 1, actual: 1, correct: 1, realized_return: 0.0029 },
    { date: '2024-09-16', horizon_days: 5, prob_up: 0.54, predicted: 1, actual: 1, correct: 1, realized_return: 0.0092 },
  ],
}

export const demoMetrics: MetricsResponse = {
  generated_at: `Sample — ${DEMO_PREV}T00:00:00Z`,
  model_version: 'demo-v1',
  horizons: {
    '1d': {
      selected_model: 'hist_gradient_boosting',
      model_comparison: [
        {
          model_name: 'hist_gradient_boosting',
          mean_val_roc_auc: 0.54,
          mean_val_brier: 0.247,
          mean_val_accuracy: 0.535,
          fold_roc_auc: [0.52, 0.55, 0.54, 0.56, 0.53],
          selected: true,
        },
        {
          model_name: 'random_forest',
          mean_val_roc_auc: 0.52,
          mean_val_brier: 0.249,
          mean_val_accuracy: 0.528,
          fold_roc_auc: [0.50, 0.53, 0.52, 0.54, 0.51],
        },
        {
          model_name: 'logistic_regression',
          mean_val_roc_auc: 0.51,
          mean_val_brier: 0.249,
          mean_val_accuracy: 0.522,
          fold_roc_auc: [0.49, 0.52, 0.51, 0.52, 0.51],
        },
      ],
      baselines: {
        majority_class: {
          n_observations: 300,
          test_period_start: '2022-01-03',
          test_period_end: '2023-03-15',
          class_distribution: { class_0: 141, class_1: 159 },
          accuracy: 0.53,
          balanced_accuracy: 0.5,
          precision_up: 0.53,
          recall_up: 1.0,
          f1_up: 0.693,
          brier: 0.249,
          roc_auc: null,
          confusion_matrix: [[0, 141], [0, 159]],
        },
        persistence: {
          n_observations: 300,
          test_period_start: '2022-01-03',
          test_period_end: '2023-03-15',
          class_distribution: { class_0: 141, class_1: 159 },
          accuracy: 0.512,
          balanced_accuracy: 0.508,
          precision_up: 0.535,
          recall_up: 0.541,
          f1_up: 0.538,
          brier: 0.251,
          roc_auc: 0.505,
          confusion_matrix: [[68, 73], [73, 86]],
        },
      },
      holdout: {
        n_observations: 300,
        test_period_start: '2022-01-03',
        test_period_end: '2023-03-15',
        class_distribution: { class_0: 141, class_1: 159 },
        accuracy: 0.547,
        balanced_accuracy: 0.541,
        precision_up: 0.564,
        recall_up: 0.579,
        f1_up: 0.572,
        brier: 0.246,
        roc_auc: 0.548,
        confusion_matrix: [[72, 69], [67, 92]],
      },
      yearly: [
        { year: 2022, n: 250, accuracy: 0.552, balanced_accuracy: 0.548, roc_auc: 0.552 },
        { year: 2023, n: 50, accuracy: 0.520, balanced_accuracy: 0.514, roc_auc: 0.531 },
      ],
      confidence_buckets: [
        { bucket: 'low', confidence_range: [0.0, 0.55], n: 180, accuracy: 0.517 },
        { bucket: 'moderate', confidence_range: [0.55, 0.65], n: 95, accuracy: 0.579 },
        { bucket: 'high', confidence_range: [0.65, 1.0], n: 25, accuracy: 0.680 },
      ],
      calibration: [
        { bin_center: 0.35, predicted_prob: 0.36, empirical_prob: 0.40, n: 40 },
        { bin_center: 0.45, predicted_prob: 0.46, empirical_prob: 0.48, n: 80 },
        { bin_center: 0.55, predicted_prob: 0.56, empirical_prob: 0.55, n: 90 },
        { bin_center: 0.65, predicted_prob: 0.66, empirical_prob: 0.63, n: 60 },
        { bin_center: 0.75, predicted_prob: 0.74, empirical_prob: 0.72, n: 30 },
      ],
      backtest: {
        available: true,
        threshold: 0.6,
        cost_bps_per_side: 5,
        cumulative_return_strategy: 0.062,
        cumulative_return_buy_hold: 0.048,
        max_drawdown_strategy: -0.081,
        trades: 34,
        hit_rate_when_in_market: 0.581,
        test_period_start: '2022-01-03',
        test_period_end: '2023-03-15',
        n_days: 300,
        disclaimer:
          'Educational historical simulation. Past performance does not guarantee future results.',
      },
    },
    '5d': {
      selected_model: 'logistic_regression',
      model_comparison: [
        {
          model_name: 'logistic_regression',
          mean_val_roc_auc: 0.55,
          mean_val_brier: 0.243,
          mean_val_accuracy: 0.541,
          fold_roc_auc: [0.53, 0.56, 0.54, 0.57, 0.55],
          selected: true,
        },
        {
          model_name: 'hist_gradient_boosting',
          mean_val_roc_auc: 0.53,
          mean_val_brier: 0.246,
          mean_val_accuracy: 0.531,
          fold_roc_auc: [0.51, 0.54, 0.53, 0.55, 0.52],
        },
        {
          model_name: 'random_forest',
          mean_val_roc_auc: 0.51,
          mean_val_brier: 0.250,
          mean_val_accuracy: 0.523,
          fold_roc_auc: [0.49, 0.52, 0.51, 0.53, 0.50],
        },
      ],
      baselines: {
        majority_class: {
          n_observations: 296,
          test_period_start: '2022-01-03',
          test_period_end: '2023-03-08',
          class_distribution: { class_0: 133, class_1: 163 },
          accuracy: 0.55,
          balanced_accuracy: 0.5,
          precision_up: 0.55,
          recall_up: 1.0,
          f1_up: 0.71,
          brier: 0.248,
          roc_auc: null,
          confusion_matrix: [[0, 133], [0, 163]],
        },
        persistence: {
          n_observations: 296,
          test_period_start: '2022-01-03',
          test_period_end: '2023-03-08',
          class_distribution: { class_0: 133, class_1: 163 },
          accuracy: 0.510,
          balanced_accuracy: 0.504,
          precision_up: 0.548,
          recall_up: 0.552,
          f1_up: 0.550,
          brier: 0.252,
          roc_auc: 0.502,
          confusion_matrix: [[62, 71], [73, 90]],
        },
      },
      holdout: {
        n_observations: 296,
        test_period_start: '2022-01-03',
        test_period_end: '2023-03-08',
        class_distribution: { class_0: 133, class_1: 163 },
        accuracy: 0.554,
        balanced_accuracy: 0.542,
        precision_up: 0.575,
        recall_up: 0.601,
        f1_up: 0.588,
        brier: 0.243,
        roc_auc: 0.556,
        confusion_matrix: [[66, 67], [65, 98]],
      },
      yearly: [
        { year: 2022, n: 248, accuracy: 0.560, balanced_accuracy: 0.548, roc_auc: 0.562 },
        { year: 2023, n: 48, accuracy: 0.523, balanced_accuracy: 0.516, roc_auc: 0.531 },
      ],
      confidence_buckets: [
        { bucket: 'low', confidence_range: [0.0, 0.55], n: 190, accuracy: 0.526 },
        { bucket: 'moderate', confidence_range: [0.55, 0.65], n: 88, accuracy: 0.591 },
        { bucket: 'high', confidence_range: [0.65, 1.0], n: 18, accuracy: 0.667 },
      ],
      calibration: [
        { bin_center: 0.35, predicted_prob: 0.37, empirical_prob: 0.41, n: 35 },
        { bin_center: 0.45, predicted_prob: 0.46, empirical_prob: 0.48, n: 75 },
        { bin_center: 0.55, predicted_prob: 0.56, empirical_prob: 0.58, n: 95 },
        { bin_center: 0.65, predicted_prob: 0.66, empirical_prob: 0.60, n: 60 },
        { bin_center: 0.75, predicted_prob: 0.74, empirical_prob: 0.69, n: 31 },
      ],
      backtest: {
        available: false,
        reason: 'not_applicable_for_horizon',
      },
    },
  },
}

export const demoNews: NewsResponse = {
  available: true,
  articles: [
    {
      title: 'Sample — Fed minutes suggest patience as inflation cools',
      url: 'https://example.com/sample-article-1',
      source: 'Sample News Wire',
      time_published: `Sample — ${DEMO_DATE}T14:30:00Z`,
      overall_sentiment_label: 'Somewhat-Bullish',
      overall_sentiment_score: 0.18,
      ticker_relevance: 0.62,
    },
    {
      title: 'Sample — Mega-cap tech leads the tape as small caps lag',
      url: 'https://example.com/sample-article-2',
      source: 'Sample Markets Desk',
      time_published: `Sample — ${DEMO_DATE}T12:05:00Z`,
      overall_sentiment_label: 'Neutral',
      overall_sentiment_score: 0.03,
      ticker_relevance: 0.55,
    },
  ],
  aggregate: { n_articles: 2, avg_score: 0.105 },
  note: 'Current news context is displayed separately and is not used by the forecasting model.',
}

export const demoAnalogues: AnalogueResponse = {
  available: true,
  symbol: 'SPY',
  query_date: DEMO_DATE,
  features_as_of: DEMO_DATE,
  data_as_of: DEMO_DATE,
  limit: 5,
  methodology: {
    method: 'standardized_euclidean_nearest_neighbors',
    distance:
      'Euclidean distance in the space of standardized (z-scored) features. Statistics fit only on eligible historical rows.',
    features: [
      'return_1d_lag',
      'return_5d',
      'return_10d',
      'distance_from_sma_20',
      'distance_from_sma_50',
      'rsi_14',
      'rolling_vol_20',
      'opening_gap_pct',
      'volume_to_20d_avg',
      'bollinger_band_position_20',
      'macd',
    ],
    feature_schema_version: 'demo-1',
    minimum_separation_days: 20,
    candidate_pool_size: 512,
  },
  summary: {
    analogue_count: 5,
    positive_after_1d_pct: 60.0,
    positive_after_5d_pct: 40.0,
    median_return_1d: 0.0015,
    median_return_5d: -0.0031,
    avg_return_1d: 0.0022,
    avg_return_5d: -0.0018,
  },
  analogues: [
    {
      date: '2019-03-12',
      similarity: 82.4,
      distance: 0.58,
      close: 279.15,
      return_1d: 0.006,
      return_5d: 0.021,
      direction_1d: 'up',
      direction_5d: 'up',
      rsi_14: 63.2,
      rolling_vol_20: 0.0091,
      distance_from_sma_20: 0.014,
      relative_volume: 0.87,
    },
    {
      date: '2017-08-04',
      similarity: 78.1,
      distance: 0.72,
      close: 247.41,
      return_1d: 0.003,
      return_5d: -0.005,
      direction_1d: 'up',
      direction_5d: 'down',
      rsi_14: 58.6,
      rolling_vol_20: 0.0074,
      distance_from_sma_20: 0.009,
      relative_volume: 0.71,
    },
    {
      date: '2015-11-04',
      similarity: 74.5,
      distance: 0.83,
      close: 210.36,
      return_1d: -0.004,
      return_5d: -0.011,
      direction_1d: 'down',
      direction_5d: 'down',
      rsi_14: 55.9,
      rolling_vol_20: 0.0088,
      distance_from_sma_20: 0.006,
      relative_volume: 0.94,
    },
    {
      date: '2013-09-19',
      similarity: 71.2,
      distance: 0.91,
      close: 173.05,
      return_1d: 0.001,
      return_5d: 0.004,
      direction_1d: 'up',
      direction_5d: 'up',
      rsi_14: 61.4,
      rolling_vol_20: 0.0067,
      distance_from_sma_20: 0.011,
      relative_volume: 0.82,
    },
    {
      date: '2011-04-27',
      similarity: 67.8,
      distance: 1.02,
      close: 136.42,
      return_1d: 0.004,
      return_5d: -0.008,
      direction_1d: 'up',
      direction_5d: 'down',
      rsi_14: 66.1,
      rolling_vol_20: 0.0102,
      distance_from_sma_20: 0.018,
      relative_volume: 1.05,
    },
  ],
  disclaimer:
    'Historical similarity does not imply the same future outcome. Analogues describe past market environments, not a prediction.',
  mode: 'demo',
  cache_status: 'demo',
  generated_at: `Sample — ${DEMO_DATE}T20:15:00Z`,
}
