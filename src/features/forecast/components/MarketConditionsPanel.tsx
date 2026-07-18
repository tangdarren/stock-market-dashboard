import { cn } from '@/lib/utils/cn'
import type { MarketResponse } from '../api/types'
import {
  formatChange,
  formatPercent,
  formatPrice,
  formatVolume,
} from '../utils/format'
import { PriceHistoryChart } from './PriceHistoryChart'

interface MarketConditionsPanelProps {
  market?: MarketResponse
}

interface Metric {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down' | 'neutral'
  mono?: boolean
}

interface MetricGroup {
  title: string
  metrics: Metric[]
}

/**
 * Grouped snapshot of the latest completed SPY session and the indicators
 * used by the model. The three groups (Price / Momentum / Risk & Activity)
 * match how a discretionary analyst would think about the tape, and the
 * price chart sits beside them so the numbers have visual context.
 */
export function MarketConditionsPanel({ market }: MarketConditionsPanelProps) {
  const groups = buildGroups(market)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 xl:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Snapshot
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Latest completed session at a glance, grouped by concern.
        </p>

        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <MetricGroupBlock key={group.title} group={group} />
          ))}
        </div>
      </div>

      <div className="xl:col-span-3">
        <PriceHistoryChart market={market} />
      </div>
    </div>
  )
}

function MetricGroupBlock({ group }: { group: MetricGroup }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#00FFB2]/70">
        {group.title}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {group.metrics.map((metric, index) => (
          <div
            key={`${group.title}-${metric.label}-${index}`}
            className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3"
          >
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">
              {metric.label}
            </dt>
            <dd
              className={cn(
                'mt-1 text-sm font-semibold',
                metric.mono && 'font-mono',
                metric.tone === 'up' && 'text-[#00FFB2]',
                metric.tone === 'down' && 'text-red-400',
                (!metric.tone || metric.tone === 'neutral') && 'text-slate-100',
              )}
            >
              {metric.value}
            </dd>
            {metric.hint ? (
              <p className="mt-0.5 text-[11px] text-slate-500">{metric.hint}</p>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  )
}

function buildGroups(market?: MarketResponse): MetricGroup[] {
  if (!market) {
    return [
      {
        title: 'Price',
        metrics: placeholderMetrics(3),
      },
      { title: 'Momentum', metrics: placeholderMetrics(2) },
      { title: 'Risk & activity', metrics: placeholderMetrics(3) },
    ]
  }

  const latest = market.latest
  const previous = market.previous
  const series = market.series
  const closes = series.map((s) => s.close)
  const volumes = series.map((s) => s.volume)

  const sma20 = tailMean(closes, 20)
  const distFromSma20 =
    latest && sma20 ? ((latest.close - sma20) / sma20) * 100 : null
  const rollingVol20 = rollingVol(closes, 20)
  const avgVol20 = tailMean(volumes, 20)
  const rsi14 = rsi(closes, 14)
  const ret5d = tailReturn(closes, 5)
  const relVolume =
    latest && avgVol20 && avgVol20 > 0 ? latest.volume / avgVol20 : null

  const change =
    market.change ?? (latest && previous ? latest.close - previous.close : null)
  const changePct =
    market.change_percent ??
    (latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : null)
  const changeTone: Metric['tone'] =
    change == null ? 'neutral' : change >= 0 ? 'up' : 'down'
  const smaTone: Metric['tone'] =
    distFromSma20 == null ? 'neutral' : distFromSma20 >= 0 ? 'up' : 'down'
  const retTone: Metric['tone'] =
    ret5d == null ? 'neutral' : ret5d >= 0 ? 'up' : 'down'
  const rsiHint =
    rsi14 == null
      ? undefined
      : rsi14 >= 70
        ? 'Overbought zone'
        : rsi14 <= 30
          ? 'Oversold zone'
          : 'Neutral zone'

  return [
    {
      title: 'Price',
      metrics: [
        {
          label: 'Latest close',
          value: latest ? `$${formatPrice(latest.close)}` : '—',
          hint: latest ? new Date(latest.date).toLocaleDateString() : undefined,
          mono: true,
        },
        {
          label: 'Daily change',
          value:
            change != null && changePct != null
              ? `${formatChange(change)} (${formatPercent(changePct, 2)})`
              : '—',
          tone: changeTone,
          mono: true,
        },
        {
          label: 'vs 20-day SMA',
          value:
            distFromSma20 != null ? formatPercent(distFromSma20, 2) : '—',
          tone: smaTone,
          hint: sma20 ? `SMA20 $${formatPrice(sma20)}` : undefined,
        },
      ],
    },
    {
      title: 'Momentum',
      metrics: [
        {
          label: 'RSI (14)',
          value: rsi14 != null ? rsi14.toFixed(1) : '—',
          hint: rsiHint,
        },
        {
          label: '5-day return',
          value: ret5d != null ? formatPercent(ret5d * 100, 2) : '—',
          tone: retTone,
        },
      ],
    },
    {
      title: 'Risk & activity',
      metrics: [
        {
          label: '20-day volatility',
          value:
            rollingVol20 != null ? formatPercent(rollingVol20 * 100, 2) : '—',
          hint: 'Std. dev. of daily returns',
        },
        {
          label: 'Volume',
          value: formatVolume(latest?.volume),
        },
        {
          label: 'Relative volume',
          value:
            relVolume != null ? `${relVolume.toFixed(2)}×` : '—',
          hint: '×20-day average',
        },
      ],
    },
  ]
}

function placeholderMetrics(n: number): Metric[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `—`,
    value: '—',
    hint: undefined,
    tone: 'neutral' as const,
    mono: i === 0,
  }))
}

// ---------- pure math helpers -------------------------------------------------

function tailMean(values: number[], window: number): number | null {
  if (values.length < window) return null
  const slice = values.slice(-window)
  return slice.reduce((sum, v) => sum + v, 0) / window
}

function rollingVol(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  const returns: number[] = []
  for (let i = closes.length - window; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length
  const variance =
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance)
}

function tailReturn(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  const last = closes[closes.length - 1]
  const first = closes[closes.length - 1 - window]
  return (last - first) / first
}

function rsi(closes: number[], window: number): number | null {
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
