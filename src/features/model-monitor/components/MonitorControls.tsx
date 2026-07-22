import { cn } from '@/lib/utils/cn'
import {
  MONITORING_HORIZONS,
  MONITORING_WINDOWS,
  type MonitoringHorizon,
  type MonitoringWindow,
} from '../api/types'
import { formatHorizonLabel, formatWindowLabel } from '../utils/format'

interface MonitorControlsProps {
  horizon: MonitoringHorizon
  window: MonitoringWindow
  onHorizonChange: (horizon: MonitoringHorizon) => void
  onWindowChange: (window: MonitoringWindow) => void
  disabled?: boolean
}

export function MonitorControls({
  horizon,
  window,
  onHorizonChange,
  onWindowChange,
  disabled = false,
}: MonitorControlsProps) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div>
        <p
          id="monitor-horizon-label"
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          Forecast horizon
        </p>
        <div
          role="radiogroup"
          aria-labelledby="monitor-horizon-label"
          className="mt-2 flex flex-wrap gap-2"
        >
          {MONITORING_HORIZONS.map((option) => {
            const selected = option === horizon
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onHorizonChange(option)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-[#00FFB2]/40 bg-[#00FFB2]/10 text-[#00FFB2]'
                    : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.06]',
                )}
              >
                {formatHorizonLabel(option)}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p
          id="monitor-window-label"
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500"
        >
          Rolling window
        </p>
        <div
          role="radiogroup"
          aria-labelledby="monitor-window-label"
          className="mt-2 flex flex-wrap gap-2"
        >
          {MONITORING_WINDOWS.map((option) => {
            const selected = option === window
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onWindowChange(option)}
                className={cn(
                  'rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-[#00FFB2]/40 bg-[#00FFB2]/10 text-[#00FFB2]'
                    : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.06]',
                )}
              >
                {formatWindowLabel(option)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
