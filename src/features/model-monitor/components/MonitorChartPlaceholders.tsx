import { GlassCard } from '@/features/ui/components/GlassCard'

interface MonitorChartPlaceholdersProps {
  horizonLabel: string
  windowLabel: string
}

function PlaceholderPanel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div
      className="flex min-h-[180px] flex-col justify-between rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] p-5"
      aria-label={`${title} chart placeholder`}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Coming next
        </p>
        <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
      </div>
      <div className="mt-6 h-16 rounded-lg bg-gradient-to-r from-white/[0.02] via-white/[0.05] to-white/[0.02]" />
    </div>
  )
}

export function MonitorChartPlaceholders({
  horizonLabel,
  windowLabel,
}: MonitorChartPlaceholdersProps) {
  return (
    <GlassCard className="p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
        Detailed charts
      </p>
      <h2 className="mt-1 text-xl font-semibold text-white">Visualization placeholders</h2>
      <p className="mt-2 text-sm text-slate-400">
        Chart surfaces for the {horizonLabel} / {windowLabel} selection will land in the next
        pass. Layout slots are reserved below.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PlaceholderPanel
          title="Rolling performance series"
          description="Accuracy, Brier, and ECE over chronological rolling windows."
        />
        <PlaceholderPanel
          title="Confidence versus actual accuracy"
          description="Calibration gap between average predicted confidence and realized hit rate."
        />
        <PlaceholderPanel
          title="Feature drift ranking"
          description="PSI scores ranked by severity for the selected recent window."
        />
        <PlaceholderPanel
          title="Observation coverage"
          description="Counts of scored walk-forward and engineered feature rows."
        />
      </div>
    </GlassCard>
  )
}
