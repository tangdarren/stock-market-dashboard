import { cn } from '@/lib/utils/cn'
import { formatProbability } from '../utils/format'

interface ProbabilityBarProps {
  probUp: number
  className?: string
  label?: string
}

/**
 * Two-color horizontal probability bar. Accessible: exposes a proper
 * progressbar role with min/max/current values and an aria-label.
 */
export function ProbabilityBar({ probUp, className, label = 'Probability up vs down' }: ProbabilityBarProps) {
  const clamped = Math.max(0, Math.min(1, probUp))
  const upPct = Math.round(clamped * 1000) / 10
  const downPct = Math.round((1 - clamped) * 1000) / 10

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Up {formatProbability(clamped)}</span>
        <span>Down {formatProbability(1 - clamped)}</span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={upPct}
        aria-label={label}
        aria-valuetext={`Up ${upPct}%, down ${downPct}%`}
        className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-red-500/20"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#00FFB2]"
          style={{ width: `${upPct}%` }}
        />
      </div>
    </div>
  )
}
