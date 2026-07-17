import { useOvernightSummary } from '../hooks/useOvernightSummary'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { Badge } from '@/components/common/Badge'
import { LoadingState } from '@/features/ui/components/LoadingState'
import { ErrorState } from '@/features/ui/components/ErrorState'
import { formatChange, formatPercent, formatPrice } from '../utils/marketFormatters'
import { cn } from '@/lib/utils/cn'

export function OvernightMovesCard() {
  const { data: overnight, isLoading, isError, refetch } = useOvernightSummary()

  if (isLoading)
    return (
      <GlassCard className="p-8">
        <LoadingState message="Loading overnight data…" />
      </GlassCard>
    )
  if (isError || !overnight)
    return (
      <GlassCard className="p-8">
        <ErrorState onRetry={() => void refetch()} />
      </GlassCard>
    )

  const gapBadge =
    overnight.gapDirection === 'gap_up'
      ? 'success'
      : overnight.gapDirection === 'gap_down'
        ? 'danger'
        : 'neutral'

  const gapLabel =
    overnight.gapDirection === 'gap_up'
      ? 'Gap Up'
      : overnight.gapDirection === 'gap_down'
        ? 'Gap Down'
        : 'Flat Open'

  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Overnight Activity
        </p>
        <Badge variant={gapBadge as 'success' | 'danger' | 'neutral'}>
          {gapLabel} {Math.abs(overnight.gapPercent).toFixed(2)}%
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-300">{overnight.summary}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">Pre-Mkt Price</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-200">
            {formatPrice(overnight.preMarketPrice)}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">Pre-Mkt Change</p>
          <p
            className={cn(
              'mt-0.5 text-sm font-semibold',
              overnight.preMarketChange >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {formatChange(overnight.preMarketChange)} (
            {formatPercent(overnight.preMarketChangePercent)})
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">Futures Δ</p>
          <p
            className={cn(
              'mt-0.5 text-sm font-semibold',
              overnight.futuresChange >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {formatChange(overnight.futuresChange)} (
            {formatPercent(overnight.futuresChangePercent)})
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">Gap Size</p>
          <p
            className={cn(
              'mt-0.5 text-sm font-semibold',
              overnight.gapPercent >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {overnight.gapPercent >= 0 ? '+' : ''}
            {overnight.gapPercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
