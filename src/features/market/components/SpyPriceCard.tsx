import { useSpyQuote } from '../hooks/useSpyQuote'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { Badge } from '@/components/common/Badge'
import { LoadingState } from '@/features/ui/components/LoadingState'
import { ErrorState } from '@/features/ui/components/ErrorState'
import { formatPrice, formatChange, formatPercent, formatVolume } from '../utils/marketFormatters'
import { formatTime } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

export function SpyPriceCard() {
  const { data: quote, isLoading, isError, refetch } = useSpyQuote()

  if (isLoading) return <GlassCard className="p-8"><LoadingState message="Fetching SPY…" /></GlassCard>
  if (isError || !quote) return <GlassCard className="p-8"><ErrorState onRetry={() => void refetch()} /></GlassCard>

  const isPositive = quote.change >= 0

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              SPY
            </span>
            <Badge variant="neutral" dot>Live</Badge>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight text-white">
              {formatPrice(quote.price)}
            </span>
            <span
              className={cn(
                'text-lg font-semibold',
                isPositive ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {formatChange(quote.change)} ({formatPercent(quote.changePercent)})
            </span>
          </div>
        </div>
        <Badge variant={isPositive ? 'success' : 'danger'} className="text-sm">
          {isPositive ? '▲' : '▼'} {isPositive ? 'Up' : 'Down'}
        </Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Open', value: formatPrice(quote.open) },
          { label: 'Prev Close', value: formatPrice(quote.previousClose) },
          { label: 'High', value: formatPrice(quote.high) },
          { label: 'Low', value: formatPrice(quote.low) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white/[0.03] p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Vol: <span className="text-slate-400">{formatVolume(quote.volume)}</span>
        </p>
        <p className="text-xs text-slate-600">
          As of <span className="text-slate-500">{formatTime(quote.timestamp)}</span>
        </p>
      </div>
    </GlassCard>
  )
}
