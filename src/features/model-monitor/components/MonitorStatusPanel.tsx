import { ForecastErrorState } from '@/features/forecast/components/ForecastErrorState'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { LoadingState } from '@/features/ui/components/LoadingState'
import { unavailableReasonMessage } from '../utils/format'

interface MonitorStatusPanelProps {
  isLoading: boolean
  backendUnavailable: boolean
  unavailableReason?: string | null
  unavailableDetail?: string | null
  errorMessage?: string | null
  onRetry?: () => void
  simulated?: boolean
}

export function MonitorStatusPanel({
  isLoading,
  backendUnavailable,
  unavailableReason,
  unavailableDetail,
  errorMessage,
  onRetry,
  simulated = false,
}: MonitorStatusPanelProps) {
  if (isLoading) {
    return (
      <GlassCard className="p-6 sm:p-8">
        <LoadingState message="Loading model health…" />
      </GlassCard>
    )
  }

  if (backendUnavailable) {
    return (
      <ForecastErrorState
        title="Backend unavailable"
        message="The monitoring API could not be reached. Start the FastAPI server and retry."
        reason="backend_unavailable"
        onRetry={onRetry}
      />
    )
  }

  if (unavailableReason) {
    const workbookMissing =
      simulated &&
      (unavailableReason === 'simulated_workbook_missing' ||
        unavailableReason.includes('simulated'))
    return (
      <GlassCard className="p-6 sm:p-8">
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
            {workbookMissing ? 'Simulated monitoring unavailable' : 'Monitoring unavailable'}
          </p>
          <h2 className="text-xl font-semibold text-white">
            {workbookMissing ? 'Workbook not ready' : 'Artifacts not ready'}
          </h2>
          <p className="text-sm text-slate-300">
            {unavailableDetail || unavailableReasonMessage(unavailableReason)}
          </p>
          <p className="text-xs text-slate-500">
            Reason: <span className="text-slate-400">{unavailableReason}</span>
          </p>
          {onRetry ? (
            <div>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </GlassCard>
    )
  }

  if (errorMessage) {
    return (
      <ForecastErrorState
        title="Monitoring request failed"
        message={errorMessage}
        onRetry={onRetry}
      />
    )
  }

  return null
}
