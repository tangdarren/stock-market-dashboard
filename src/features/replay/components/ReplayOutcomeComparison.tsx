import { cn } from '@/lib/utils/cn'
import { formatPercent, formatProbability } from '@/features/forecast/utils/format'
import { ForecastErrorState } from '@/features/forecast/components/ForecastErrorState'
import { LoadingState } from '@/features/ui/components/LoadingState'
import type {
  ReplayDirection,
  ReplayHorizonOutcome,
  ReplayResultResponse,
} from '../api/types'
import {
  directionLabel,
  horizonLabel,
  type LockedReplayPrediction,
  type ReplayForecastHorizon,
} from '../utils/prediction'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]'

interface ReplayOutcomeComparisonProps {
  prediction: LockedReplayPrediction
  result: ReplayResultResponse | undefined
  isLoading: boolean
  isError: boolean
  errorMessage?: string | null
  onRetry: () => void
  onRestart: () => void
}

export function ReplayOutcomeComparison({
  prediction,
  result,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onRestart,
}: ReplayOutcomeComparisonProps) {
  if (isLoading && !result) {
    return (
      <div role="status" aria-live="polite">
        <LoadingState message="Revealing historical outcome…" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <ForecastErrorState
          title="Could not load outcome"
          message={
            errorMessage ??
            'The result endpoint failed. Your locked prediction is unchanged — retry when ready.'
          }
          onRetry={onRetry}
        />
        <button
          type="button"
          onClick={onRestart}
          className={cn(
            'rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-slate-200',
            'transition-colors hover:border-white/[0.2] hover:text-white',
            focusRing,
          )}
        >
          Restart prediction
        </button>
      </div>
    )
  }

  if (!result) return null

  if (!result.available) {
    return (
      <RevealShell>
        <h2 className="text-lg font-semibold text-white">Outcome unavailable</h2>
        <p className="mt-2 text-sm text-slate-400">
          {result.detail ??
            'A walk-forward result is not available for this session. Your locked prediction is unchanged.'}
        </p>
        <button
          type="button"
          onClick={onRestart}
          className={cn(
            'mt-4 rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-slate-200',
            focusRing,
          )}
        >
          Restart prediction
        </button>
      </RevealShell>
    )
  }

  const primary = outcomeForHorizon(result, prediction.horizon)
  const secondaryHorizon: ReplayForecastHorizon = prediction.horizon === 1 ? 5 : 1
  const secondary = outcomeForHorizon(result, secondaryHorizon)

  if (!primary) {
    return (
      <RevealShell>
        <h2 className="text-lg font-semibold text-white">Outcome incomplete</h2>
        <p className="mt-2 text-sm text-slate-400">
          The selected horizon was missing from the result payload.
        </p>
      </RevealShell>
    )
  }

  const userCorrect = prediction.direction === primary.direction_actual
  const modelCorrect = primary.correct

  return (
    <RevealShell>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#00FFB2]">
          Outcome revealed
        </p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          Comparison — {horizonLabel(prediction.horizon)}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Your locked forecast versus the walk-forward model and the realized move.
        </p>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <CompareItem label="Your direction" value={directionLabel(prediction.direction)} />
        <CompareItem label="Your confidence" value={`${prediction.confidence}%`} />
        <CompareItem
          label="Your implied p(up)"
          value={formatProbability(prediction.probUp)}
          mono
        />
        <CompareItem
          label="Model probability (selected horizon)"
          value={formatProbability(primary.prob_up)}
          mono
        />
        <CompareItem
          label="Model direction"
          value={directionLabel(primary.direction_predicted)}
          tone={primary.direction_predicted}
        />
        <CompareItem
          label="Actual direction"
          value={directionLabel(primary.direction_actual)}
          tone={primary.direction_actual}
        />
        <CompareItem
          label="Realized return"
          value={formatPercent(primary.realized_return * 100, 2)}
          mono
          tone={signTone(primary.realized_return)}
        />
        <CompareItem
          label="You were correct"
          value={userCorrect ? 'Yes' : 'No'}
          tone={userCorrect ? 'up' : 'down'}
        />
        <CompareItem
          label="Model was correct"
          value={modelCorrect ? 'Yes' : 'No'}
          tone={modelCorrect ? 'up' : 'down'}
        />
      </dl>

      <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-slate-400">
        {result.evaluation_note ||
          'The model forecast came from out-of-sample walk-forward evaluation, not from a retrospective run of the final trained model.'}
      </p>

      {secondary ? (
        <aside
          aria-label={`Secondary information for ${horizonLabel(secondaryHorizon)}`}
          className="mt-6 rounded-xl border border-dashed border-white/[0.1] bg-transparent p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Other horizon (not scored this round)
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {horizonLabel(secondaryHorizon)} — model{' '}
            <span className="text-slate-200">
              {directionLabel(secondary.direction_predicted)}
            </span>{' '}
            at {formatProbability(secondary.prob_up)}; actual{' '}
            <span className="text-slate-200">
              {directionLabel(secondary.direction_actual)}
            </span>{' '}
            ({formatPercent(secondary.realized_return * 100, 2)}). Model{' '}
            {secondary.correct ? 'correct' : 'incorrect'}.
          </p>
        </aside>
      ) : null}

      <button
        type="button"
        onClick={onRestart}
        className={cn(
          'mt-6 rounded-xl border border-white/[0.12] px-4 py-2.5 text-sm font-medium text-slate-200',
          'transition-colors hover:border-white/[0.2] hover:text-white',
          focusRing,
        )}
      >
        Restart prediction
      </button>
    </RevealShell>
  )
}

function outcomeForHorizon(
  result: ReplayResultResponse,
  horizon: ReplayForecastHorizon,
): ReplayHorizonOutcome | null {
  return horizon === 1 ? result.one_day : result.five_day
}

function signTone(value: number): ReplayDirection | undefined {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return undefined
}

function CompareItem({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: ReplayDirection
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 text-sm font-medium',
          mono && 'font-mono',
          tone === 'up' && 'text-[#00FFB2]',
          tone === 'down' && 'text-red-400',
          !tone && 'text-slate-100',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function RevealShell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Outcome comparison" className="animate-replay-reveal space-y-1">
      {children}
    </section>
  )
}
