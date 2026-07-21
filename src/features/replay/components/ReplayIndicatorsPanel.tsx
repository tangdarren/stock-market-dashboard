import { cn } from '@/lib/utils/cn'
import { formatPercent, formatPrice } from '@/features/forecast/utils/format'
import type { ReplayIndicators } from '../api/types'

interface ReplayIndicatorsPanelProps {
  indicators: ReplayIndicators | null
  selectedDate: string
}

interface MetricCard {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down' | 'neutral'
}

export function ReplayIndicatorsPanel({
  indicators,
  selectedDate,
}: ReplayIndicatorsPanelProps) {
  const cards = buildCards(indicators)

  return (
    <section aria-label="Market conditions as of selected date">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Market conditions</h2>
        <p className="mt-1 text-sm text-slate-400">
          Data available through{' '}
          <span className="font-medium text-slate-200">{selectedDate}</span>. Every value uses
          only information known by that completed session.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {card.label}
            </p>
            <p
              className={cn(
                'mt-2 font-mono text-base font-semibold sm:text-lg',
                card.tone === 'up' && 'text-[#00FFB2]',
                card.tone === 'down' && 'text-red-400',
                (!card.tone || card.tone === 'neutral') && 'text-slate-100',
              )}
            >
              {card.value}
            </p>
            {card.hint ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function buildCards(indicators: ReplayIndicators | null): MetricCard[] {
  if (!indicators) {
    return [
      { label: 'Closing price', value: '—' },
      { label: 'Momentum (5d)', value: '—' },
      { label: 'RSI (14)', value: '—' },
      { label: 'Rolling vol (20d)', value: '—' },
      { label: 'vs 20-day SMA', value: '—' },
      { label: 'Relative volume', value: '—' },
      { label: 'Opening gap', value: '—' },
    ]
  }

  const momentumTone = toneFromSigned(indicators.momentum_5d)
  const smaTone = toneFromSigned(indicators.distance_from_sma_20)
  const gapTone = toneFromSigned(indicators.opening_gap_pct)
  const rsiHint =
    indicators.rsi_14 == null
      ? undefined
      : indicators.rsi_14 >= 70
        ? 'Overbought zone'
        : indicators.rsi_14 <= 30
          ? 'Oversold zone'
          : 'Neutral zone'

  const cards: MetricCard[] = [
    {
      label: 'Closing price',
      value: indicators.close != null ? `$${formatPrice(indicators.close)}` : '—',
      hint: 'Selected session close',
    },
    {
      label: 'Momentum (5d)',
      value:
        indicators.momentum_5d != null
          ? formatPercent(indicators.momentum_5d * 100, 2)
          : '—',
      hint: '5-session return',
      tone: momentumTone,
    },
    {
      label: 'RSI (14)',
      value: indicators.rsi_14 != null ? indicators.rsi_14.toFixed(1) : '—',
      hint: rsiHint,
    },
    {
      label: 'Rolling vol (20d)',
      value:
        indicators.rolling_vol_20 != null
          ? formatPercent(indicators.rolling_vol_20 * 100, 2)
          : '—',
      hint: 'Std. dev. of daily returns',
    },
    {
      label: 'vs 20-day SMA',
      value:
        indicators.distance_from_sma_20 != null
          ? formatPercent(indicators.distance_from_sma_20 * 100, 2)
          : '—',
      hint: 'Distance from SMA20',
      tone: smaTone,
    },
    {
      label: 'Relative volume',
      value:
        indicators.relative_volume != null
          ? `${indicators.relative_volume.toFixed(2)}×`
          : '—',
      hint: '×20-day average',
    },
  ]

  if (indicators.opening_gap_pct != null) {
    cards.push({
      label: 'Opening gap',
      value: formatPercent(indicators.opening_gap_pct * 100, 2),
      hint: 'Open vs prior close',
      tone: gapTone,
    })
  }

  return cards
}

function toneFromSigned(value: number | null): MetricCard['tone'] {
  if (value == null || !Number.isFinite(value)) return 'neutral'
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'neutral'
}
