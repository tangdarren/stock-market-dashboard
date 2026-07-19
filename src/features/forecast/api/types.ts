export type Mode = 'live' | 'cached' | 'stale' | 'demo' | 'model_unavailable' | 'unavailable'
export type Direction = 'up' | 'down'
export type Confidence = 'low' | 'moderate' | 'high'
export type ExplanationDirection = 'up' | 'down' | 'uncertainty'

export interface CacheMeta {
  fetchedAt?: string
  expiresAt?: string
  cacheStatus?: string
  isStale?: boolean
}

export interface SpyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketResponse {
  series: SpyBar[]
  latest: SpyBar | null
  previous: SpyBar | null
  change: number | null
  change_percent: number | null
  features_as_of: string
  data_as_of: string
  target_session: string
  source: string
  mode: Mode
  is_stale: boolean
  cache: CacheMeta
}

export interface ExplanationFactor {
  label: string
  feature: string
  value: number
  direction: ExplanationDirection
  contribution: number
  plain_english: string
}

export interface Explanations {
  method: string
  up: ExplanationFactor[]
  down: ExplanationFactor[]
  uncertainty: ExplanationFactor[]
}

export interface HorizonForecast {
  horizon_days: number
  prob_up: number
  prob_down: number
  direction: Direction
  confidence: Confidence
  model_name: string
  trained_at: string
  features_as_of: string
  explanations: Explanations
}

export interface ForecastResponse {
  one_day: HorizonForecast | null
  five_day: HorizonForecast | null
  features_as_of: string | null
  data_as_of: string | null
  mode: Mode
  is_stale: boolean
  disclaimer: string
  model_unavailable: boolean
  reason?: string
  model_version?: string | null
}

export interface WalkForwardRecord {
  date: string
  horizon_days: number
  prob_up: number
  predicted: number
  actual: number
  correct: number
  realized_return: number
}

export interface ForecastHistoryResponse {
  records: WalkForwardRecord[]
  count: number
  model_version?: string | null
}

export interface ModelComparisonRow {
  model_name: string
  mean_val_roc_auc: number | null
  mean_val_brier: number | null
  mean_val_accuracy: number | null
  fold_roc_auc: (number | null)[]
  selected?: boolean
}

export interface HoldoutMetrics {
  n_observations: number
  test_period_start: string
  test_period_end: string
  class_distribution: { class_0: number; class_1: number }
  accuracy: number
  balanced_accuracy: number
  precision_up: number
  recall_up: number
  f1_up: number
  brier: number
  roc_auc: number | null
  confusion_matrix: number[][]
}

export interface CalibrationPoint {
  bin_center: number
  predicted_prob: number
  empirical_prob: number
  n: number
}

export interface YearlyMetric {
  year: number
  n: number
  accuracy: number
  balanced_accuracy: number
  roc_auc: number | null
}

export interface ConfidenceBucket {
  bucket: 'low' | 'moderate' | 'high'
  confidence_range: [number, number]
  n: number
  accuracy: number | null
}

export interface BacktestSummary {
  available: boolean
  reason?: string
  threshold?: number
  cost_bps_per_side?: number
  cumulative_return_strategy?: number
  cumulative_return_buy_hold?: number
  max_drawdown_strategy?: number
  trades?: number
  hit_rate_when_in_market?: number
  test_period_start?: string
  test_period_end?: string
  n_days?: number
  disclaimer?: string
}

export interface HorizonMetrics {
  selected_model: string
  model_comparison: ModelComparisonRow[]
  baselines: Record<string, HoldoutMetrics>
  holdout: HoldoutMetrics
  yearly: YearlyMetric[]
  confidence_buckets: ConfidenceBucket[]
  calibration: CalibrationPoint[]
  backtest: BacktestSummary
}

export interface MetricsResponse {
  horizons: Record<string, HorizonMetrics>
  generated_at: string
  model_version?: string | null
}

export interface NewsArticle {
  title: string
  url: string
  source: string
  time_published: string
  overall_sentiment_label: string | null
  overall_sentiment_score: number | null
  ticker_relevance: number | null
}

export interface NewsResponse {
  available: boolean
  reason?: string
  articles?: NewsArticle[]
  aggregate?: { n_articles: number; avg_score: number | null }
  meta?: CacheMeta
  note: string
}

export interface HealthResponse {
  status: string
  service: string
  version: string
  time: string
  env: string
  alpha_vantage_configured: boolean
  market_cache_available: boolean
  model_available: boolean
}

// --- Historical analogues ----------------------------------------------------

export interface AnalogueRecord {
  date: string
  similarity: number
  distance: number
  close: number
  return_1d: number
  return_5d: number
  direction_1d: Direction
  direction_5d: Direction
  rsi_14: number | null
  rolling_vol_20: number | null
  distance_from_sma_20: number | null
  relative_volume: number | null
}

export interface AnalogueSummary {
  analogue_count: number
  positive_after_1d_pct: number | null
  positive_after_5d_pct: number | null
  median_return_1d: number | null
  median_return_5d: number | null
  avg_return_1d: number | null
  avg_return_5d: number | null
}

export interface AnalogueMethodology {
  method: string
  distance?: string
  features: string[]
  feature_schema_version?: string
  minimum_separation_days: number
  candidate_pool_size?: number
}

export interface AnalogueResponse {
  available: boolean
  symbol: string
  query_date: string | null
  features_as_of: string | null
  data_as_of: string | null
  limit: number | null
  methodology: AnalogueMethodology
  summary: AnalogueSummary | null
  analogues: AnalogueRecord[]
  disclaimer: string
  mode: Mode
  cache_status?: string
  generated_at?: string
  reason?: string
  detail?: string
}
