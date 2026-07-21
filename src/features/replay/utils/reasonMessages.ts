const REASON_TITLES: Record<string, string> = {
  weekend: 'Weekend date',
  market_holiday: 'Market holiday',
  insufficient_history: 'Not enough prior history',
  walk_forward_prediction_unavailable: 'No walk-forward prediction',
  outcome_unavailable: 'Outcomes unavailable',
  date_out_of_range: 'Date out of range',
  not_a_trading_session: 'Not a trading session',
  date_not_eligible: 'Date not eligible',
  invalid_date: 'Invalid date',
  historical_dataset_missing: 'Historical data missing',
  historical_dataset_malformed: 'Historical data unreadable',
  walk_forward_artifact_missing: 'Prediction artifact missing',
  walk_forward_artifact_malformed: 'Prediction artifact unreadable',
  no_eligible_sessions: 'No eligible sessions',
}

export function replayReasonTitle(reason?: string | null): string {
  if (!reason) return 'Session unavailable'
  return REASON_TITLES[reason] ?? 'Session unavailable'
}

export function replayReasonMessage(
  reason?: string | null,
  detail?: string | null,
): string {
  if (detail && detail.trim()) return detail
  switch (reason) {
    case 'weekend':
      return 'SPY does not trade on weekends. Choose a weekday trading session.'
    case 'market_holiday':
      return 'SPY does not trade on this US market holiday. Choose another date.'
    case 'insufficient_history':
      return 'This date does not have enough prior sessions to build indicators and a chart.'
    case 'walk_forward_prediction_unavailable':
      return 'No out-of-sample walk-forward prediction exists for this date.'
    case 'outcome_unavailable':
      return 'Known one-session and five-session outcomes are not available for this date.'
    case 'date_out_of_range':
      return 'This date falls outside the eligible Market Replay Lab range.'
    case 'not_a_trading_session':
      return 'SPY did not trade on this date. Choose a nearby eligible session.'
    case 'date_not_eligible':
      return 'This date is not eligible for Market Replay Lab. Try a nearby suggestion.'
    case 'invalid_date':
      return 'Enter a valid calendar date as YYYY-MM-DD.'
    case 'historical_dataset_missing':
      return 'Local SPY history has not been bootstrapped on the backend yet.'
    case 'historical_dataset_malformed':
      return 'Local SPY history could not be read. Re-run the bootstrap script on the backend.'
    case 'walk_forward_artifact_missing':
      return 'Walk-forward prediction artifacts are not available on the backend yet.'
    case 'walk_forward_artifact_malformed':
      return 'Walk-forward prediction artifacts could not be read. Retrain models on the backend.'
    case 'no_eligible_sessions':
      return 'No eligible Market Replay Lab sessions are available in the local dataset.'
    default:
      return 'This date cannot be loaded for Market Replay Lab.'
  }
}
