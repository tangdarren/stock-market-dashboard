import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils/cn'
import { formatProbability } from '@/features/forecast/utils/format'
import type { ReplayDirection } from '../api/types'
import {
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  horizonLabel,
  impliedProbUp,
  type ReplayForecastHorizon,
  type ReplayPredictionDraft,
} from '../utils/prediction'

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]'

const HORIZONS = [1, 5] as const
const DIRECTIONS = [
  { value: 'up' as const, label: 'Up' },
  { value: 'down' as const, label: 'Down' },
]

interface ReplayPredictionFormProps {
  draft: ReplayPredictionDraft
  frozen: boolean
  canLock: boolean
  onHorizonChange: (horizon: ReplayForecastHorizon) => void
  onDirectionChange: (direction: ReplayDirection) => void
  onConfidenceChange: (confidence: number) => void
  onLock: () => void
}

export function ReplayPredictionForm({
  draft,
  frozen,
  canLock,
  onHorizonChange,
  onDirectionChange,
  onConfidenceChange,
  onLock,
}: ReplayPredictionFormProps) {
  const previewProb =
    draft.direction != null && draft.confidence != null
      ? impliedProbUp(draft.direction, draft.confidence)
      : null

  const handleHorizonKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (frozen) return
    const next = cycleOption(event.key, HORIZONS, draft.horizon)
    if (next == null) return
    event.preventDefault()
    onHorizonChange(next)
  }

  const handleDirectionKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (frozen) return
    const values = DIRECTIONS.map((item) => item.value)
    const next = cycleOption(event.key, values, draft.direction)
    if (next == null) return
    event.preventDefault()
    onDirectionChange(next)
  }

  return (
    <section aria-label="Configure your prediction" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Your prediction</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose a forecast horizon, direction, and confidence. Locking freezes your
          choices before the historical outcome is revealed.
        </p>
      </div>

      <fieldset disabled={frozen} className="space-y-3 disabled:opacity-70">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Forecast horizon
        </legend>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Forecast horizon"
          onKeyDown={handleHorizonKeyDown}
        >
          {HORIZONS.map((horizon) => {
            const selected = draft.horizon === horizon
            return (
              <button
                key={horizon}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={
                  frozen
                    ? -1
                    : selected || (draft.horizon == null && horizon === HORIZONS[0])
                      ? 0
                      : -1
                }
                disabled={frozen}
                onClick={() => onHorizonChange(horizon)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  focusRing,
                  selected
                    ? 'border-[#00FFB2]/45 bg-[#00FFB2]/10 text-white'
                    : 'border-white/[0.1] bg-white/[0.03] text-slate-200 hover:border-[#00FFB2]/25',
                  frozen && 'cursor-not-allowed',
                )}
              >
                <span className="font-medium">{horizonLabel(horizon)}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset disabled={frozen} className="space-y-3 disabled:opacity-70">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Direction
        </legend>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Direction"
          onKeyDown={handleDirectionKeyDown}
        >
          {DIRECTIONS.map((option) => {
            const selected = draft.direction === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={
                  frozen
                    ? -1
                    : selected ||
                        (draft.direction == null && option.value === DIRECTIONS[0].value)
                      ? 0
                      : -1
                }
                disabled={frozen}
                onClick={() => onDirectionChange(option.value)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                  focusRing,
                  selected &&
                    option.value === 'up' &&
                    'border-[#00FFB2]/45 bg-[#00FFB2]/10 text-[#00FFB2]',
                  selected &&
                    option.value === 'down' &&
                    'border-red-400/45 bg-red-400/10 text-red-300',
                  !selected &&
                    'border-white/[0.1] bg-white/[0.03] text-slate-200 hover:border-white/[0.2]',
                  frozen && 'cursor-not-allowed',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="space-y-3">
        <label htmlFor="replay-confidence" className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Confidence
          </span>
          <span className="mt-1 block text-sm text-slate-300">
            {draft.confidence != null ? `${draft.confidence}%` : 'Not set — choose 50% to 100%'}
          </span>
        </label>
        <input
          id="replay-confidence"
          type="range"
          min={CONFIDENCE_MIN}
          max={CONFIDENCE_MAX}
          step={1}
          value={draft.confidence ?? CONFIDENCE_MIN}
          disabled={frozen}
          aria-valuemin={CONFIDENCE_MIN}
          aria-valuemax={CONFIDENCE_MAX}
          aria-valuenow={draft.confidence ?? undefined}
          aria-valuetext={
            draft.confidence != null ? `${draft.confidence} percent` : 'Confidence not set'
          }
          onChange={(event) => onConfidenceChange(Number(event.target.value))}
          className={cn(
            'w-full accent-[#00FFB2] disabled:cursor-not-allowed disabled:opacity-60',
            focusRing,
            'rounded-lg',
          )}
        />
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>{CONFIDENCE_MIN}%</span>
          <span>{CONFIDENCE_MAX}%</span>
        </div>
      </div>

      {previewProb != null ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          Implied probability of an upward outcome:{' '}
          <span className="font-mono font-semibold text-white">
            {formatProbability(previewProb)}
          </span>
        </p>
      ) : null}

      {!frozen ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onLock}
            disabled={!canLock}
            className={cn(
              'rounded-xl bg-[#00FFB2] px-4 py-2.5 text-sm font-semibold text-black transition-colors',
              'hover:bg-[#00e6a0] disabled:cursor-not-allowed disabled:opacity-50',
              focusRing,
            )}
          >
            Lock prediction
          </button>
          {!canLock ? (
            <p className="text-xs text-slate-500" role="status">
              Select a horizon, direction, and confidence to lock.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function cycleOption<T>(
  key: string,
  options: readonly T[],
  current: T | null,
): T | null {
  if (options.length === 0) return null
  const index = current == null ? -1 : options.indexOf(current)

  if (key === 'ArrowRight' || key === 'ArrowDown' || key === ' ') {
    if (key === ' ' && current != null) return null
    const nextIndex = index < 0 ? 0 : (index + 1) % options.length
    return options[nextIndex] ?? null
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    const nextIndex = index <= 0 ? options.length - 1 : index - 1
    return options[nextIndex] ?? null
  }
  if (key === 'Home') return options[0] ?? null
  if (key === 'End') return options[options.length - 1] ?? null
  return null
}
