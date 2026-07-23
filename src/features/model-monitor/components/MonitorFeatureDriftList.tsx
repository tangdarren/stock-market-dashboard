import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import type { MonitoringFeatureDriftBlock } from '../api/types'
import {
  formatFeatureName,
  formatMetricScore,
  statusBadgeVariant,
  statusGlyph,
  statusLabel,
} from '../utils/format'

interface MonitorFeatureDriftListProps {
  featureDrift: MonitoringFeatureDriftBlock | null
}

export function MonitorFeatureDriftList({ featureDrift }: MonitorFeatureDriftListProps) {
  const ranked = featureDrift?.ranked ?? []
  const maxPsi = Math.max(
    0.25,
    ...ranked.map((row) => (row.psi != null && Number.isFinite(row.psi) ? row.psi : 0)),
  )

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
            Feature drift
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">PSI ranking</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Features ordered by Population Stability Index versus the training-time
            reference. Expand a row for the plain-English explanation.
          </p>
        </div>
        {featureDrift ? (
          <p className="text-xs text-slate-500">
            {featureDrift.status_counts.drift_detected} drift ·{' '}
            {featureDrift.status_counts.watch} watch · {featureDrift.status_counts.stable}{' '}
            stable
          </p>
        ) : null}
      </div>

      {!featureDrift || ranked.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          Feature-drift scores are unavailable for this selection.
        </p>
      ) : (
        <ul className="mt-6 space-y-2" aria-label="Feature drift ranking">
          {ranked.map((row, index) => {
            const psi = row.psi
            const widthPct =
              psi != null && Number.isFinite(psi)
                ? Math.max(4, Math.min(100, (psi / maxPsi) * 100))
                : 0
            const detailsId = `feature-drift-${row.feature}`
            return (
              <li key={row.feature}>
                <details className="group rounded-xl border border-white/[0.05] bg-white/[0.02]">
                  <summary
                    aria-controls={detailsId}
                    className={cn(
                      'flex cursor-pointer list-none flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                      'hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                      '[&::-webkit-details-marker]:hidden',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] tabular-nums text-slate-500">
                          #{index + 1}
                        </span>
                        <span className="truncate text-sm font-medium text-white">
                          {formatFeatureName(row.feature)}
                        </span>
                        <Badge variant={statusBadgeVariant(row.status)} dot>
                          <span aria-hidden className="mr-1">
                            {statusGlyph(row.status)}
                          </span>
                          {statusLabel(row.status)}
                        </Badge>
                      </div>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={Number(maxPsi.toFixed(2))}
                        aria-valuenow={psi == null ? 0 : Number(psi.toFixed(3))}
                        aria-label={`${formatFeatureName(row.feature)} PSI`}
                        aria-valuetext={
                          psi == null ? 'PSI unavailable' : `PSI ${formatMetricScore(psi, 3)}`
                        }
                      >
                        <div
                          className={cn(
                            'h-full rounded-full transition-[width] duration-300',
                            row.status === 'drift_detected'
                              ? 'bg-red-400/80'
                              : row.status === 'watch'
                                ? 'bg-amber-300/80'
                                : 'bg-[#00FFB2]/70',
                          )}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs sm:min-w-[220px]">
                      <div>
                        <p className="text-slate-500">PSI</p>
                        <p className="mt-0.5 font-medium tabular-nums text-slate-100">
                          {formatMetricScore(psi, 3)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Recent</p>
                        <p className="mt-0.5 font-medium tabular-nums text-slate-100">
                          {formatMetricScore(row.recent.mean, 2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Reference</p>
                        <p className="mt-0.5 font-medium tabular-nums text-slate-100">
                          {formatMetricScore(row.reference.mean, 2)}
                        </p>
                      </div>
                    </div>
                  </summary>
                  <div
                    id={detailsId}
                    className="border-t border-white/[0.04] px-4 py-3 text-sm text-slate-400"
                  >
                    {row.explanation}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </GlassCard>
  )
}
