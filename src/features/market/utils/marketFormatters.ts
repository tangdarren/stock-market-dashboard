import { formatChange, formatPercent, formatPrice, formatVolume } from '@/lib/utils/number'
import type { SpyQuote } from '../api/market.types'

export function formatQuoteChange(quote: SpyQuote): string {
  return `${formatChange(quote.change)} (${formatPercent(quote.changePercent)})`
}

export function formatQuotePrice(quote: SpyQuote): string {
  return formatPrice(quote.price)
}

export function formatQuoteVolume(quote: SpyQuote): string {
  return formatVolume(quote.volume)
}

export { formatChange, formatPercent, formatPrice, formatVolume }
