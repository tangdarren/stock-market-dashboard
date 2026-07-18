import { useMemo, useState } from 'react'
import type { WalkForwardRecord } from '../api/types'
import { cn } from '@/lib/utils/cn'
import { formatPercent } from '../utils/format'

interface ForecastHistoryTableProps {
  records: WalkForwardRecord[]
}

type HorizonFilter = 'all' | '1' | '5'

const FILTERS: { id: HorizonFilter; label: string }[] = [
  { id: '1', label: '1-day' },
  { id: '5', label: '5-day' },
  { id: 'all', label: 'All horizons' },
]

export function ForecastHistoryTable({ records }: ForecastHistoryTableProps) {
  const horizons = useMemo(
    () => Array.from(new Set(records.map((r) => r.horizon_days))),
    [records],
  )
  const [filter, setFilter] = useState<HorizonFilter>(horizons.includes(1) ? '1' : 'all')

  const visible = useMemo(() => {
    if (filter === 'all') return records
    const h = Number(filter)
    return records.filter((r) => r.horizon_days === h)
  }, [records, filter])

  const hits = visible.filter((r) => r.correct === 1).length
  const hitRate = visible.length > 0 ? hits / visible.length : 0

  if (records.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        <p className="text-sm text-slate-400">
          No walk-forward predictions yet. Train the models to populate this table.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filter historical forecasts by horizon"
          className="flex flex-wrap gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1"
        >
          {FILTERS.map((f) => {
            const disabled = f.id !== 'all' && !horizons.includes(Number(f.id))
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                disabled={disabled}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                  disabled && 'cursor-not-allowed opacity-40',
                  filter === f.id && !disabled
                    ? 'bg-[#00FFB2]/10 text-[#00FFB2]'
                    : 'text-slate-400 hover:text-white',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          {visible.length} {visible.length === 1 ? 'forecast' : 'forecasts'} ·{' '}
          hit rate <span className="font-semibold text-slate-300">{(hitRate * 100).toFixed(1)}%</span>
        </p>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-white/[0.05] md:block">
        <table className="min-w-full divide-y divide-white/[0.06] text-sm">
          <caption className="sr-only">
            Recent out-of-sample historical forecasts. Columns: date, horizon,
            up probability, predicted direction, actual direction, correctness,
            and realized return.
          </caption>
          <thead className="bg-white/[0.02] text-left">
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3">
                Date
              </th>
              <th scope="col" className="px-4 py-3">
                Horizon
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                p(up)
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Predicted
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Actual
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Correct
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Return
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {visible.map((r, i) => (
              <tr key={`${r.date}-${r.horizon_days}-${i}`}>
                <td className="px-4 py-3 font-mono text-slate-300">{r.date}</td>
                <td className="px-4 py-3 text-slate-300">{r.horizon_days}-day</td>
                <td className="px-4 py-3 text-right font-mono text-slate-300">
                  {(r.prob_up * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right">{directionLabel(r.predicted)}</td>
                <td className="px-4 py-3 text-right">{directionLabel(r.actual)}</td>
                <td className="px-4 py-3 text-right">{correctBadge(r.correct)}</td>
                <td
                  className={cn(
                    'px-4 py-3 text-right font-mono',
                    r.realized_return >= 0 ? 'text-[#00FFB2]' : 'text-red-400',
                  )}
                >
                  {formatPercent(r.realized_return * 100, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        className="space-y-3 md:hidden"
        aria-label={`Historical forecasts (${filter === 'all' ? 'all horizons' : `${filter}-day`})`}
      >
        {visible.map((r, i) => (
          <li
            key={`${r.date}-${r.horizon_days}-${i}`}
            className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono">{r.date}</span>
              <span>{r.horizon_days}-day horizon</span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-white">
                  {(r.prob_up * 100).toFixed(1)}% up
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Predicted{' '}
                  <span className="font-medium text-slate-200">
                    {directionLabel(r.predicted)}
                  </span>{' '}
                  · Actual{' '}
                  <span className="font-medium text-slate-200">
                    {directionLabel(r.actual)}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm">{correctBadge(r.correct)}</p>
                <p
                  className={cn(
                    'mt-1 font-mono text-sm',
                    r.realized_return >= 0 ? 'text-[#00FFB2]' : 'text-red-400',
                  )}
                >
                  {formatPercent(r.realized_return * 100, 2)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function directionLabel(v: number): string {
  return v === 1 ? 'Up' : 'Down'
}

function correctBadge(v: number) {
  const isCorrect = v === 1
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
        isCorrect
          ? 'bg-[#00FFB2]/15 text-[#00FFB2]'
          : 'bg-red-500/15 text-red-300',
      )}
    >
      <span aria-hidden>{isCorrect ? '✓' : '✗'}</span>
      {isCorrect ? 'Correct' : 'Wrong'}
    </span>
  )
}
