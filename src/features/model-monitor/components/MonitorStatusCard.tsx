import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import type { ModelMonitoringResponse } from '../api/types'
import {
  formatHorizonLabel,
  formatWindowLabel,
  humanizeReasonCode,
  overallStatusHeadline,
  statusGlyph,
  statusLabel,
  statusToneClass,
} from '../utils/format'

interface MonitorStatusCardProps {
  data: ModelMonitoringResponse
}

export function MonitorStatusCard({ data }: MonitorStatusCardProps) {
  const simulated = data.mode === 'simulated'

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
              Overall health
            </p>
            {simulated ? (
              <span className="rounded-full border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-2 py-0.5 text-[11px] font-medium text-[#00FFB2]">
                Simulated
              </span>
            ) : null}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {overallStatusHeadline(data.status)}
          </h2>
          <p className="max-w-2xl text-sm text-slate-400">{data.status_explanation}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
            statusToneClass(data.status),
          )}
          aria-label={`Overall status ${statusLabel(data.status)}`}
        >
          <span aria-hidden>{statusGlyph(data.status)}</span>
          {statusLabel(data.status)}
        </span>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Horizon</dt>
          <dd className="mt-1 text-sm font-medium text-white">
            {formatHorizonLabel(data.horizon)}
          </dd>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Window</dt>
          <dd className="mt-1 text-sm font-medium text-white">
            {formatWindowLabel(data.window)}
          </dd>
        </div>
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Model version
          </dt>
          <dd className="mt-1 truncate text-sm font-medium text-white">
            {data.model_version ?? '—'}
          </dd>
        </div>
      </dl>

      {data.status_reasons.length > 0 ? (
        <ul className="mt-5 space-y-2" aria-label="Health status reasons">
          {data.status_reasons.map((reason) => (
            <li
              key={`${reason.source}-${reason.code}-${reason.feature ?? 'none'}`}
              className="rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2 text-xs text-slate-400"
            >
              <span className="font-medium text-slate-300">
                {humanizeReasonCode(reason.code)}
              </span>
              <span className="mx-2 text-slate-600">·</span>
              {reason.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  )
}
