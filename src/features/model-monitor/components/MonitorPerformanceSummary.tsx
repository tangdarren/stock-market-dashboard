import { GlassCard } from '@/features/ui/components/GlassCard'
import { formatDate } from '@/features/forecast/utils/format'
import type { RollingWindowPoint } from '../api/types'
import { formatMetricScore, formatPercentScore } from '../utils/format'

interface MonitorPerformanceSummaryProps {
  latest: RollingWindowPoint
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function MonitorPerformanceSummary({ latest }: MonitorPerformanceSummaryProps) {
  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
            Latest window
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Performance summary</h2>
          <p className="mt-1 text-sm text-slate-400">
            {formatDate(latest.start_date)} – {formatDate(latest.end_date)} ·{' '}
            {latest.n_observations} observations
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Accuracy"
          value={formatPercentScore(latest.accuracy)}
          hint={`Δ baseline ${formatMetricScore(latest.vs_baseline.accuracy)}`}
        />
        <MetricCard
          label="Brier score"
          value={formatMetricScore(latest.brier)}
          hint={`Δ baseline ${formatMetricScore(latest.vs_baseline.brier)}`}
        />
        <MetricCard
          label="Expected calibration error"
          value={formatMetricScore(latest.ece)}
        />
        <MetricCard
          label="Avg predicted confidence"
          value={formatPercentScore(latest.average_predicted_confidence)}
        />
        <MetricCard
          label="Actual accuracy"
          value={formatPercentScore(latest.actual_accuracy)}
        />
        <MetricCard label="Observations" value={String(latest.n_observations)} />
      </div>
    </GlassCard>
  )
}
