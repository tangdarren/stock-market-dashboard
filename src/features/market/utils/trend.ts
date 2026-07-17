import type { SpyQuote, SpyTrend, TrendDirection } from '../api/market.types'

export function computeTrend(quote: SpyQuote): SpyTrend {
  const changePercent = quote.changePercent

  let direction: TrendDirection
  let label: string
  let description: string

  if (changePercent >= 0.5) {
    direction = 'uptrend'
    label = 'Uptrend'
    description = 'SPY is trading with positive momentum today.'
  } else if (changePercent <= -0.5) {
    direction = 'downtrend'
    label = 'Downtrend'
    description = 'SPY is trading with negative momentum today.'
  } else {
    direction = 'neutral'
    label = 'Neutral'
    description = 'SPY is consolidating near the open. No clear directional bias yet.'
  }

  const priceVsPrevClose = ((quote.price - quote.previousClose) / quote.previousClose) * 100
  const priceVsOpen = ((quote.price - quote.open) / quote.open) * 100

  return {
    direction,
    label,
    description,
    priceVsSma20: priceVsPrevClose,
    priceVsSma50: priceVsOpen,
  }
}

export function trendToColor(direction: TrendDirection): string {
  switch (direction) {
    case 'uptrend':
      return 'text-emerald-400'
    case 'downtrend':
      return 'text-red-400'
    case 'neutral':
      return 'text-slate-400'
  }
}

export function trendToBadgeVariant(direction: TrendDirection) {
  switch (direction) {
    case 'uptrend':
      return 'success' as const
    case 'downtrend':
      return 'danger' as const
    case 'neutral':
      return 'neutral' as const
  }
}
