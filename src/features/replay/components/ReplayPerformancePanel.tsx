import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { formatPercent, formatProbability } from '@/features/forecast/utils/format'
import type { ReplayAttempt, ReplayPerformanceSummary } from '../history'
import { directionLabel, horizonLabel } from '../utils/prediction'
import { formatReplayCalendarDate } from '../utils/formatReplayDate'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]'

interface ReplayPerformancePanelProps {
  summary: ReplayPerformanceSummary
  recent: ReplayAttempt[]
  onClear: () => void
}

export function ReplayPerformancePanel({
  summary,
  recent,
  onClear,
}: ReplayPerformancePanelProps) {
  const [confirmingClear, setConfirmingClear] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const statusId = useId()

  useEffect(() => {
    if (confirmingClear) {
      confirmButtonRef.current?.focus()
    }
  }, [confirmingClear])

  useEffect(() => {
    if (!confirmingClear) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmingClear(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmingClear])

  const handleClearClick = () => {
    if (!confirmingClear) {
      setConfirmingClear(true)
      return
    }
    onClear()
    setConfirmingClear(false)
  }

  return (
    <section aria-labelledby="replay-performance-heading" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="replay-performance-heading" className="text-lg font-semibold text-white">
            Your replay performance
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Browser-local history of completed forecasts. Brier score measures
            probability calibration — lower scores are better (0 is perfect).
          </p>
        </div>

        {summary.totalAttempts > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {confirmingClear ? (
              <>
                <p id={statusId} className="text-xs text-amber-200/90" role="status">
                  Clear all local history? This cannot be undone.
                </p>
                <button
                  ref={confirmButtonRef}
                  type="button"
                  onClick={handleClearClick}
                  aria-describedby={statusId}
                  className={cn(
                    'rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200',
                    'transition-colors hover:bg-red-400/20',
                    focusRing,
                  )}
                >
                  Confirm clear history
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className={cn(
                    'rounded-xl border border-white/[0.12] px-3 py-2 text-sm font-medium text-slate-300',
                    'transition-colors hover:border-white/[0.2] hover:text-white',
                    focusRing,
                  )}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleClearClick}
                className={cn(
                  'rounded-xl border border-white/[0.12] px-3 py-2 text-sm font-medium text-slate-300',
                  'transition-colors hover:border-red-400/40 hover:text-red-200',
                  focusRing,
                )}
              >
                Clear history
              </button>
            )}
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Completed attempts" value={String(summary.totalAttempts)} />
        <Stat
          label="Your directional accuracy"
          value={formatAccuracy(summary.userAccuracy)}
        />
        <Stat
          label="Model directional accuracy"
          value={formatAccuracy(summary.modelAccuracy)}
          hint="Same attempts"
        />
        <Stat
          label="Average Brier score"
          value={
            summary.averageBrierScore == null
              ? '—'
              : summary.averageBrierScore.toFixed(3)
          }
          hint="Lower is better"
          mono
        />
        <Stat label="Current streak" value={String(summary.currentStreak)} />
        <Stat label="Best streak" value={String(summary.bestStreak)} />
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-white">Recent attempts</h3>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No completed forecasts yet. Lock a prediction and reveal an outcome to
            start tracking.
          </p>
        ) : (
          <>
            {/* Mobile-friendly stacked cards */}
            <ul className="mt-3 space-y-3 md:hidden" aria-label="Recent replay attempts">
              {recent.map((attempt) => (
                <li key={attempt.id}>
                  <AttemptCard attempt={attempt} />
                </li>
              ))}
            </ul>

            {/* Compact table on wider screens */}
            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <caption className="sr-only">Recent completed replay attempts</caption>
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-[0.12em] text-slate-500">
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Date
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Horizon
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      You
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Model
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Actual
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Return
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Result
                    </th>
                    <th scope="col" className="px-2 py-2 font-semibold">
                      Brier
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((attempt) => (
                    <tr
                      key={attempt.id}
                      className="border-b border-white/[0.05] text-slate-300"
                    >
                      <td className="px-2 py-2.5 font-mono text-xs text-slate-200">
                        {attempt.replayDate}
                      </td>
                      <td className="px-2 py-2.5">
                        {attempt.horizon === 1 ? '1 session' : '5 sessions'}
                      </td>
                      <td className="px-2 py-2.5">
                        {directionLabel(attempt.userDirection)} · {attempt.userConfidence}%
                      </td>
                      <td className="px-2 py-2.5">
                        {directionLabel(attempt.modelDirection)} ·{' '}
                        {formatProbability(attempt.modelProbUp)}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2.5 font-medium',
                          attempt.actualDirection === 'up'
                            ? 'text-[#00FFB2]'
                            : 'text-red-400',
                        )}
                      >
                        {directionLabel(attempt.actualDirection)}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs">
                        {formatPercent(attempt.realizedReturn * 100, 2)}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2.5 font-medium',
                          attempt.userCorrect ? 'text-[#00FFB2]' : 'text-red-400',
                        )}
                      >
                        {attempt.userCorrect ? 'Correct' : 'Incorrect'}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs">
                        {attempt.brierScore.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function AttemptCard({ attempt }: { attempt: ReplayAttempt }) {
  return (
    <article className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-400">{attempt.replayDate}</p>
          <p className="mt-1 text-sm font-medium text-white">
            {formatReplayCalendarDate(attempt.replayDate)}
          </p>
        </div>
        <p
          className={cn(
            'shrink-0 rounded-lg px-2 py-1 text-xs font-semibold',
            attempt.userCorrect
              ? 'bg-[#00FFB2]/10 text-[#00FFB2]'
              : 'bg-red-400/10 text-red-300',
          )}
        >
          {attempt.userCorrect ? 'Correct' : 'Incorrect'}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Horizon</dt>
          <dd className="mt-0.5 text-slate-200">{horizonLabel(attempt.horizon)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Your forecast</dt>
          <dd className="mt-0.5 text-slate-200">
            {directionLabel(attempt.userDirection)} · {attempt.userConfidence}%
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Model</dt>
          <dd className="mt-0.5 text-slate-200">
            {directionLabel(attempt.modelDirection)} ·{' '}
            {formatProbability(attempt.modelProbUp)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Actual</dt>
          <dd
            className={cn(
              'mt-0.5 font-medium',
              attempt.actualDirection === 'up' ? 'text-[#00FFB2]' : 'text-red-400',
            )}
          >
            {directionLabel(attempt.actualDirection)} ·{' '}
            {formatPercent(attempt.realizedReturn * 100, 2)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Brier score</dt>
          <dd className="mt-0.5 font-mono text-slate-200">
            {attempt.brierScore.toFixed(3)}
            <span className="ml-1 text-slate-500">(lower better)</span>
          </dd>
        </div>
      </dl>
    </article>
  )
}

function Stat({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </dt>
      <dd className={cn('mt-1.5 text-lg font-semibold text-white', mono && 'font-mono')}>
        {value}
      </dd>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

function formatAccuracy(value: number | null): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}
