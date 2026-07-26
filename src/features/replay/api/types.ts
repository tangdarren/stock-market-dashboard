export type ReplayDirection = 'up' | 'down'
export type ReplayMode = 'historical' | 'unavailable' | 'simulated'


export interface ReplayChartBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ReplayIndicators {
  close: number | null
  momentum_5d: number | null
  rsi_14: number | null
  rolling_vol_20: number | null
  distance_from_sma_20: number | null
  opening_gap_pct: number | null
  relative_volume: number | null
}

export interface ReplayMethodology {
  summary: string
  lookback_sessions: number
  min_feature_history: number
  horizons: number[]
  prediction_source: 'walk_forward_predictions' | 'simulated_forecast_history'

  feature_engineering: string
}

export interface ReplaySessionResponse {
  available: boolean
  symbol: 'SPY'
  selected_date: string | null
  min_eligible_date: string | null
  max_eligible_date: string | null
  nearest_eligible_before: string | null
  nearest_eligible_after: string | null
  lookback_sessions: number
  session_count: number
  series: ReplayChartBar[]
  indicators: ReplayIndicators | null
  horizons: number[]
  mode: ReplayMode
  source: string
  methodology: ReplayMethodology
  disclaimer: string
  generated_at: string
  reason?: string | null
  detail?: string | null
}

export interface ReplayHorizonOutcome {
  horizon_days: number
  prob_up: number
  direction_predicted: ReplayDirection
  realized_return: number
  direction_actual: ReplayDirection
  predicted: number
  actual: number
  correct: boolean
}

export interface ReplayModelMetadata {
  holdout_start?: string | null
  holdout_end?: string | null
  model_name_1d?: string | null
  model_name_5d?: string | null
  n_holdout_1d?: number | null
  n_holdout_5d?: number | null
  evaluation?: string
}

export interface ReplayResultResponse {
  available: boolean
  symbol: 'SPY'
  selected_date: string | null
  one_day: ReplayHorizonOutcome | null
  five_day: ReplayHorizonOutcome | null
  source: 'walk_forward_predictions' | 'simulated_workbook'

  evaluation_note: string
  disclaimer: string
  mode: ReplayMode
  model_version?: string | null
  model_metadata?: ReplayModelMetadata | null
  min_eligible_date?: string | null
  max_eligible_date?: string | null
  nearest_eligible_before?: string | null
  nearest_eligible_after?: string | null
  generated_at: string
  reason?: string | null
  detail?: string | null
}

/** Discriminated request used by the session React Query hook. */
export type ReplaySessionRequest =
  | { kind: 'random'; nonce: number }
  | { kind: 'date'; date: string; nonce: number }
