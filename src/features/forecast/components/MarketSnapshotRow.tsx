import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import type { MarketResponse } from '../api/types'
import {
  formatChange,
  formatPercent,
  formatPrice,
  formatVolume,
} from '../utils/format'

interface MarketSnapshotRowProps {
  market?: MarketResponse
}

interface Stat {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down' | 'neutral'
}

function computeStats(market?: MarketResponse): Stat[] {
  if (!market) {
    return Array.from({ length: 6 }, () => ({ label: '—', value: '—' }))
  }

  const latest = market.latest
  const previous = market.previous
  const series = market.series

  const closes = series.map((s) => s.close)
  const volumes = series.map((s) => s.volume)

  const sma20 = _tailMean(closes, 20)
  const distFromSma20 = latest && sma20 ? ((latest.close - sma20) / sma20) * 100 : null
  const rollingVol20 = _rollingVol(closes, 20)
  const avgVol20 = _tailMean(volumes, 20)
  const rsi14 = _rsi(closes, 14)

  const change = market.change ?? (latest && previous ? latest.close - previous.close : null)
  const changePct = market.change_percent ??
    (latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : null)
  const changeTone: Stat['tone'] = change == null ? 'neutral' : change >= 0 ? 'up' : 'down'
  const distTone: Stat['tone'] = distFromSma20 == null ? 'neutral' : distFromSma20 >= 0 ? 'up' : 'down'

  return [
    {
      label: 'Latest close',
      value: latest ? `$${formatPrice(latest.close)}` : '—',
      hint: latest ? new Date(latest.date).toLocaleDateString() : undefined,
    },
    {
      label: 'Daily change',
      value:
        change != null && changePct != null
          ? `${formatChange(change)} (${formatPercent(changePct, 2)})`
          : '—',
      tone: changeTone,
    },
    {
      label: 'Volume',
      value: formatVolume(latest?.volume),
    },
    {
      label: '20-day avg vol',
      value: formatVolume(avgVol20),
    },
    {
      label: 'RSI (14)',
      value: rsi14 != null ? rsi14.toFixed(1) : '—',
      hint: rsi14 != null ? (rsi14 >= 70 ? 'Overbought zone' : rsi14 <= 30 ? 'Oversold zone' : 'Neutral zone') : undefined,
    },
    {
      label: '20-day vol',
      value: rollingVol20 != null ? formatPercent(rollingVol20 * 100, 2) : '—',
    },
    {
      label: 'vs 20-day SMA',
      value: distFromSma20 != null ? formatPercent(distFromSma20, 2) : '—',
      tone: distTone,
    },
  ]
}

export function MarketSnapshotRow({ market }: MarketSnapshotRowProps) {
  const stats = computeStats(market)
  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Current SPY snapshot</h2>
        <p className="text-xs text-slate-500">Latest completed session</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
          >
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              {stat.label}
            </dt>
            <dd
              className={cn(
                'mt-1 text-sm font-semibold',
                stat.tone === 'up' && 'text-[#00FFB2]',
                stat.tone === 'down' && 'text-red-400',
                !stat.tone || stat.tone === 'neutral' ? 'text-slate-200' : '',
              )}
            >
              {stat.value}
            </dd>
            {stat.hint ? (
              <p className="mt-1 text-[11px] text-slate-500">{stat.hint}</p>
            ) : null}
          </div>
        ))}
      </dl>
    </GlassCard>
  )
}

// ---------- helpers ----------

function _tailMean(values: number[], window: number): number | null {
  if (values.length < window) return null
  const slice = values.slice(-window)
  return slice.reduce((sum, v) => sum + v, 0) / window
}

function _rollingVol(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  const returns: number[] = []
  for (let i = closes.length - window; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance)
}

function _rsi(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  let gains = 0
  let losses = 0
  const start = closes.length - window - 1
  for (let i = start + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses += -diff
  }
  const avgGain = gains / window
  const avgLoss = losses / window
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}
