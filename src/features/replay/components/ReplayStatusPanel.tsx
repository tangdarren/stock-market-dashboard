import { ForecastErrorState } from '@/features/forecast/components/ForecastErrorState'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { LoadingState } from '@/features/ui/components/LoadingState'
import { ReplayNearbyDates } from './ReplayNearbyDates'
import { replayReasonMessage, replayReasonTitle } from '../utils/reasonMessages'

interface ReplayStatusPanelProps {
  isLoading: boolean
  backendUnavailable: boolean
  clientError: string | null
  unavailableReason?: string | null
  unavailableDetail?: string | null
  nearestBefore?: string | null
  nearestAfter?: string | null
  errorMessage?: string | null
  onRetry?: () => void
  onSelectNearby: (date: string) => void
}

export function ReplayStatusPanel({
  isLoading,
  backendUnavailable,
  clientError,
  unavailableReason,
  unavailableDetail,
  nearestBefore,
  nearestAfter,
  errorMessage,
  onRetry,
  onSelectNearby,
}: ReplayStatusPanelProps) {
  if (isLoading) {
    return (
      <GlassCard className="p-6">
        <LoadingState message="Loading historical session…" />
      </GlassCard>
    )
  }

  if (clientError) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white">Invalid date</h3>
        <p className="mt-2 text-sm text-slate-300">{clientError}</p>
      </GlassCard>
    )
  }

  if (backendUnavailable) {
    return (
      <ForecastErrorState
        title="Backend unavailable"
        message="The Market Replay Lab could not reach the API. Start the backend or retry once it is online."
        reason="backend_unavailable"
        onRetry={onRetry}
      />
    )
  }

  if (unavailableReason) {
    return (
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white">
          {replayReasonTitle(unavailableReason)}
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          {replayReasonMessage(unavailableReason, unavailableDetail)}
        </p>
        <p className="sr-only">Reason code: {unavailableReason}</p>
        <ReplayNearbyDates
          before={nearestBefore ?? null}
          after={nearestAfter ?? null}
          onSelect={onSelectNearby}
        />
      </GlassCard>
    )
  }

  if (errorMessage) {
    return (
      <ForecastErrorState
        title="Something went wrong"
        message={errorMessage}
        onRetry={onRetry}
      />
    )
  }

  return null
}
