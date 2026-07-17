import { useSpyTrend } from '../hooks/useSpyTrend'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { Badge } from '@/components/common/Badge'
import { LoadingState } from '@/features/ui/components/LoadingState'
import { ErrorState } from '@/features/ui/components/ErrorState'
import { trendToBadgeVariant, trendToColor } from '../utils/trend'
import { cn } from '@/lib/utils/cn'

const trendIcon = {
  uptrend: '↗',
  downtrend: '↘',
  neutral: '→',
}

export function TrendCard() {
  const { trend, isLoading, isError } = useSpyTrend()

  if (isLoading) return <GlassCard className="p-8"><LoadingState message="Analyzing trend…" /></GlassCard>
  if (isError || !trend) return <GlassCard className="p-8"><ErrorState /></GlassCard>

  return (
    <GlassCard className="p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Daily Trend
      </p>

      <div className="mt-3 flex items-center gap-3">
        <span
          className={cn(
            'text-4xl font-bold',
            trendToColor(trend.direction),
          )}
        >
          {trendIcon[trend.direction]}
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">{trend.label}</span>
            <Badge variant={trendToBadgeVariant(trend.direction)}>
              {trend.direction}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">{trend.description}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">vs Prev Close</p>
          <p
            className={cn(
              'mt-0.5 text-sm font-semibold',
              trend.priceVsSma20 >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {trend.priceVsSma20 >= 0 ? '+' : ''}
            {trend.priceVsSma20.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-3">
          <p className="text-xs text-slate-500">vs Open</p>
          <p
            className={cn(
              'mt-0.5 text-sm font-semibold',
              trend.priceVsSma50 >= 0 ? 'text-emerald-400' : 'text-red-400',
            )}
          >
            {trend.priceVsSma50 >= 0 ? '+' : ''}
            {trend.priceVsSma50.toFixed(2)}%
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
