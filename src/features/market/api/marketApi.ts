import { apiClient } from '@/lib/api/client'
import type { SpyQuote, OvernightSummary } from './market.types'

const SPY_TICKER_ID = '913243251'

interface WebullQuoteResponse {
  tickerId: string
  symbol: string
  close: string
  change: string
  changeRatio: string
  open: string
  preClose: string
  high: string
  low: string
  volume: string
  vibrateRatio: string
  tradeTime: number
}

export async function fetchSpyQuote(): Promise<SpyQuote> {
  const data = await apiClient.get<WebullQuoteResponse>(
    `/quote/tickerRealTimes/getTickerRealTime?tickerId=${SPY_TICKER_ID}`,
  )

  return {
    symbol: data.symbol,
    price: parseFloat(data.close),
    change: parseFloat(data.change),
    changePercent: parseFloat(data.changeRatio) * 100,
    open: parseFloat(data.open),
    previousClose: parseFloat(data.preClose),
    high: parseFloat(data.high),
    low: parseFloat(data.low),
    volume: parseInt(data.volume, 10),
    timestamp: new Date(data.tradeTime * 1000).toISOString(),
  }
}

export async function fetchOvernightSummary(): Promise<OvernightSummary> {
  const data = await apiClient.get<WebullQuoteResponse>(
    `/quote/tickerRealTimes/getTickerRealTime?tickerId=${SPY_TICKER_ID}&extendTrading=1`,
  )

  const preMarketPrice = parseFloat(data.close)
  const prevClose = parseFloat(data.preClose)
  const preMarketChange = preMarketPrice - prevClose
  const preMarketChangePercent = (preMarketChange / prevClose) * 100
  const futuresChange = parseFloat(data.change)
  const futuresChangePercent = parseFloat(data.changeRatio) * 100
  const gapPercent = preMarketChangePercent

  const gapDirection =
    gapPercent > 0.1 ? 'gap_up' : gapPercent < -0.1 ? 'gap_down' : 'flat'

  const summaryText =
    gapDirection === 'gap_up'
      ? `SPY is gapping up ${Math.abs(gapPercent).toFixed(2)}% in pre-market, suggesting bullish overnight sentiment.`
      : gapDirection === 'gap_down'
        ? `SPY is gapping down ${Math.abs(gapPercent).toFixed(2)}% in pre-market, suggesting bearish overnight sentiment.`
        : 'SPY is opening near yesterday\'s close with minimal overnight movement.'

  return {
    futuresChange,
    futuresChangePercent,
    preMarketPrice,
    preMarketChange,
    preMarketChangePercent,
    gapDirection,
    gapPercent,
    summary: summaryText,
    timestamp: new Date().toISOString(),
  }
}
