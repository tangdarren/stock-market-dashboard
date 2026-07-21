import { cn } from '@/lib/utils/cn'
import { formatProbability } from '@/features/forecast/utils/format'
import {
  directionLabel,
  horizonLabel,
  type LockedReplayPrediction,
} from '../utils/prediction'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]'

interface ReplayLockedPredictionProps {
  prediction: LockedReplayPrediction
  revealRequested: boolean
  isResultLoading: boolean
  canCancel: boolean
  canRestart: boolean
  canReveal: boolean
  onReveal: () => void
  onCancel: () => void
  onRestart: () => void
}

export function ReplayLockedPrediction({
  prediction,
  revealRequested,
  isResultLoading,
  canCancel,
  canRestart,
  canReveal,
  onReveal,
  onCancel,
  onRestart,
}: ReplayLockedPredictionProps) {
  return (
    <section
      aria-label="Locked prediction summary"
      className="rounded-xl border border-[#00FFB2]/25 bg-[#00FFB2]/10 p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#00FFB2]">
        Prediction locked
      </p>
      <h3 className="mt-2 text-base font-semibold text-white">Your forecast is frozen</h3>
      <p className="mt-1 text-sm text-slate-400">
        Controls are disabled. Reveal the historical outcome when you are ready — the
        result is not loaded until you ask for it.
      </p>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryItem label="Horizon" value={horizonLabel(prediction.horizon)} />
        <SummaryItem label="Direction" value={directionLabel(prediction.direction)} />
        <SummaryItem label="Confidence" value={`${prediction.confidence}%`} />
        <SummaryItem
          label="Implied p(up)"
          value={formatProbability(prediction.probUp)}
          mono
        />
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {canReveal ? (
          <button
            type="button"
            onClick={onReveal}
            className={cn(
              'rounded-xl bg-[#00FFB2] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#00e6a0]',
              focusRing,
            )}
          >
            Reveal outcome
          </button>
        ) : null}

        {canCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isResultLoading}
            className={cn(
              'rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-100',
              'transition-colors hover:border-[#00FFB2]/30 hover:text-[#00FFB2]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              focusRing,
            )}
          >
            Cancel lock
          </button>
        ) : null}

        {canRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className={cn(
              'rounded-xl border border-white/[0.12] bg-transparent px-4 py-2.5 text-sm font-medium text-slate-300',
              'transition-colors hover:border-white/[0.2] hover:text-white',
              focusRing,
            )}
          >
            Restart prediction
          </button>
        ) : null}
      </div>

      {revealRequested && isResultLoading ? (
        <p className="mt-4 text-sm text-slate-400" role="status" aria-live="polite">
          Loading historical outcome…
        </p>
      ) : null}
    </section>
  )
}

function SummaryItem({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className={cn('mt-1 text-sm text-slate-100', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}
