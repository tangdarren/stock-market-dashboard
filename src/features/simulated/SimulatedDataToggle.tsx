import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'

/**
 * Accessible on/off switch for simulated workbook data.
 * State is conveyed in text ("Simulated data: ON/OFF"), not color alone.
 */
export function SimulatedDataToggle({ className }: { className?: string }) {
  const { enabled, setEnabled } = useSimulatedDataMode()
  const queryClient = useQueryClient()

  const label = enabled ? 'Simulated data: ON' : 'Simulated data: OFF'

  const onToggle = () => {
    const next = !enabled
    setEnabled(next)
    // Drop prior-mode caches so UI cannot briefly show the other mode's data.
    void queryClient.removeQueries({
      predicate: (query) => {
        const head = query.queryKey[0]
        return (
          head === 'forecast-market' ||
          head === 'forecast-spy' ||
          head === 'forecast-history' ||
          head === 'forecast-metrics' ||
          head === 'forecast-news' ||
          head === 'forecast-analogues' ||
          head === 'model-monitor' ||
          head === 'replay'
        )
      },
    })
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
        enabled
          ? 'border-[#00FFB2]/45 bg-[#00FFB2]/10 text-[#00FFB2]'
          : 'border-white/15 bg-white/[0.03] text-white/70 hover:border-white/25 hover:text-white',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors',
          enabled
            ? 'justify-end border-[#00FFB2]/50 bg-[#00FFB2]/25'
            : 'justify-start border-white/20 bg-white/10',
        )}
      >
        <span className="mx-0.5 h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <span>{label}</span>
    </button>
  )
}
