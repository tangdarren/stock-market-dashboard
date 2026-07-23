import { GlassCard } from '@/features/ui/components/GlassCard'
import type { HoldoutBaselineSummary, RollingWindowPoint } from '../api/types'
import {
  formatMetricScore,
  formatMonitorDate,
  formatPercentScore,
  formatSignedDelta,
  formatSignedPercentDelta,
} from '../utils/format'

interface MonitorBaselineComparisonProps {
  baseline: HoldoutBaselineSummary | null
  latest: RollingWindowPoint | null
}

function ComparisonRow({
  label,
  baseline,
  latest,
  delta,
  asPercent = false,
}: {
  label: string
  baseline: number | null | undefined
  latest: number | null | undefined
  delta: number | null | undefined
  asPercent?: boolean
}) {
  const fmt = asPercent ? formatPercentScore : formatMetricScore
  const deltaText = asPercent
    ? formatSignedPercentDelta(delta)
    : formatSignedDelta(delta)
  return (
    <tr className="border-t border-white/[0.04]">
      <th scope="row" className="py-3 pr-4 text-left text-sm font-medium text-slate-300">
        {label}
      </th>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-slate-400">
        {fmt(baseline)}
      </td>
      <td className="py-3 pr-4 text-right text-sm tabular-nums text-white">{fmt(latest)}</td>
      <td className="py-3 text-right text-sm tabular-nums text-slate-300">{deltaText}</td>
    </tr>
  )
}

export function MonitorBaselineComparison({
  baseline,
  latest,
}: MonitorBaselineComparisonProps) {
  return (
    <GlassCard className="p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
        Evaluation baseline
      </p>
      <h2 className="mt-1 text-xl font-semibold text-white">Holdout comparison</h2>
      <p className="mt-2 text-sm text-slate-400">
            {baseline
          ? `Original chronological holdout${
              baseline.test_period_start && baseline.test_period_end
                ? ` (${formatMonitorDate(baseline.test_period_start)} – ${formatMonitorDate(baseline.test_period_end)})`
                : ''
            }.`
          : 'Holdout baseline metrics are unavailable for this selection.'}
      </p>

      {baseline && latest ? (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse">
            <caption className="sr-only">
              Latest rolling metrics compared with the original holdout baseline
            </caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <th scope="col" className="pb-2 pr-4 text-left font-semibold">
                  Metric
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-semibold">
                  Baseline
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-semibold">
                  Latest
                </th>
                <th scope="col" className="pb-2 text-right font-semibold">
                  Delta
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="Accuracy"
                baseline={baseline.accuracy}
                latest={latest.accuracy}
                delta={latest.vs_baseline.accuracy}
                asPercent
              />
              <ComparisonRow
                label="Brier score"
                baseline={baseline.brier}
                latest={latest.brier}
                delta={latest.vs_baseline.brier}
              />
              <ComparisonRow
                label="Actual accuracy"
                baseline={baseline.actual_accuracy}
                latest={latest.actual_accuracy}
                delta={latest.vs_baseline.actual_accuracy}
                asPercent
              />
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">
          Baseline comparison will appear once both rolling and holdout metrics are available.
        </p>
      )}
    </GlassCard>
  )
}
