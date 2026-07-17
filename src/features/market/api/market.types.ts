export type TrendDirection = 'uptrend' | 'downtrend' | 'neutral'

export interface SpyQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  open: number
  previousClose: number
  high: number
  low: number
  volume: number
  timestamp: string
}

export interface SpyTrend {
  direction: TrendDirection
  label: string
  description: string
  priceVsSma20: number
  priceVsSma50: number
}

export interface OvernightSummary {
  futuresChange: number
  futuresChangePercent: number
  preMarketPrice: number
  preMarketChange: number
  preMarketChangePercent: number
  gapDirection: 'gap_up' | 'gap_down' | 'flat'
  gapPercent: number
  summary: string
  timestamp: string
}