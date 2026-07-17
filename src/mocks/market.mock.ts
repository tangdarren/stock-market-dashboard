import type { SpyQuote, OvernightSummary } from '@/features/market/api/market.types'

export const mockSpyQuote: SpyQuote = {
  symbol: 'SPY',
  price: 541.28,
  change: 4.17,
  changePercent: 0.78,
  open: 538.5,
  previousClose: 537.11,
  high: 542.8,
  low: 537.4,
  volume: 67_450_000,
  timestamp: new Date().toISOString(),
}

export const mockOvernightSummary: OvernightSummary = {
  futuresChange: 3.2,
  futuresChangePercent: 0.59,
  preMarketPrice: 539.6,
  preMarketChange: 2.49,
  preMarketChangePercent: 0.46,
  gapDirection: 'gap_up',
  gapPercent: 0.46,
  summary:
    "SPY gapped up 0.46% in pre-market, reflecting positive overnight sentiment driven by strong futures. Buyers showed early conviction near yesterday's close.",
  timestamp: new Date().toISOString(),
}
