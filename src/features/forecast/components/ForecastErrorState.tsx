import { GlassCard } from '@/features/ui/components/GlassCard'
import { ENV } from '@/lib/api/env'
import { cn } from '@/lib/utils/cn'

interface ForecastErrorStateProps {
  title?: string
  message: string
  reason?: string
  onRetry?: () => void
  onUseDemo?: () => void
  className?: string
}

export function ForecastErrorState({
  title = 'Backend unavailable',
  message,
  reason,
  onRetry,
  onUseDemo,
  className,
}: ForecastErrorStateProps) {
  return (
    <GlassCard className={cn('p-8', className)}>
      <div className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400"
          >
            !
          </span>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>

        <p className="text-sm text-slate-300">{message}</p>

        <p className="text-xs text-slate-500">
          Backend expected at{' '}
          <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300">
            {ENV.API_BASE_URL}
          </code>
          {reason ? <> — reason: <span className="text-slate-400">{reason}</span></> : null}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-[#00FFB2] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#00e6a0]"
            >
              Retry
            </button>
          ) : null}
          {onUseDemo ? (
            <button
              type="button"
              onClick={onUseDemo}
              className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.06]"
            >
              Show sample data
            </button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  )
}
