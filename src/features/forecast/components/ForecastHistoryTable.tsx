import { GlassCard } from '@/features/ui/components/GlassCard'
import type { WalkForwardRecord } from '../api/types'
import { formatPercent } from '../utils/format'

interface ForecastHistoryTableProps {
  records: WalkForwardRecord[]
}

export function ForecastHistoryTable({ records }: ForecastHistoryTableProps) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Recent historical forecasts
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Walk-forward record</h2>
        </div>
        <p className="text-xs text-slate-500">{records.length} rows</p>
      </div>

      {records.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          No walk-forward predictions yet. Train the models to populate this table.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-white/[0.05] md:block">
            <table className="min-w-full divide-y divide-white/[0.06] text-sm">
              <thead className="bg-white/[0.02] text-left">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Horizon</th>
                  <th className="px-4 py-3 text-right">p(up)</th>
                  <th className="px-4 py-3 text-right">Predicted</th>
                  <th className="px-4 py-3 text-right">Actual</th>
                  <th className="px-4 py-3 text-right">Correct</th>
                  <th className="px-4 py-3 text-right">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {records.map((r, i) => (
                  <tr key={`${r.date}-${r.horizon_days}-${i}`}>
                    <td className="px-4 py-3 font-mono text-slate-300">{r.date}</td>
                    <td className="px-4 py-3 text-slate-300">{r.horizon_days}d</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-300">
                      {(r.prob_up * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">{directionLabel(r.predicted)}</td>
                    <td className="px-4 py-3 text-right">{directionLabel(r.actual)}</td>
                    <td className="px-4 py-3 text-right">{correctLabel(r.correct)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        r.realized_return >= 0 ? 'text-[#00FFB2]' : 'text-red-400'
                      }`}
                    >
                      {formatPercent(r.realized_return * 100, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-3 md:hidden">
            {records.map((r, i) => (
              <li
                key={`${r.date}-${r.horizon_days}-${i}`}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono">{r.date}</span>
                  <span>{r.horizon_days}d horizon</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">
                      {(r.prob_up * 100).toFixed(1)}% up
                    </p>
                    <p className="text-xs text-slate-500">
                      Predicted {directionLabel(r.predicted)} · Actual {directionLabel(r.actual)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{correctLabel(r.correct)}</p>
                    <p
                      className={`mt-1 font-mono text-sm ${
                        r.realized_return >= 0 ? 'text-[#00FFB2]' : 'text-red-400'
                      }`}
                    >
                      {formatPercent(r.realized_return * 100, 2)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </GlassCard>
  )
}

function directionLabel(v: number) {
  return v === 1 ? 'Up' : 'Down'
}

function correctLabel(v: number) {
  return v === 1 ? (
    <span className="rounded bg-[#00FFB2]/15 px-2 py-0.5 text-xs text-[#00FFB2]">✓ correct</span>
  ) : (
    <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">✗ wrong</span>
  )
}
