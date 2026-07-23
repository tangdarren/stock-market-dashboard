import { GlassCard } from '@/features/ui/components/GlassCard'
import type { ModelMonitoringResponse } from '../api/types'
import {
  humanizeReasonCode,
  overallStatusHeadline,
  statusGlyph,
  statusLabel,
} from '../utils/format'

interface MonitorHealthExplanationProps {
  data: ModelMonitoringResponse
}

export function MonitorHealthExplanation({ data }: MonitorHealthExplanationProps) {
  const reasons = data.status_reasons

  return (
    <GlassCard className="p-6 sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
        Health explanation
      </p>
      <h2 className="mt-1 text-xl font-semibold text-white">
        Why status is {statusLabel(data.status).toLowerCase()}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        {overallStatusHeadline(data.status)}. The signals below are the machine-readable
        drivers behind that band for the selected horizon and window.
      </p>

      {reasons.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No detailed status drivers were returned for this selection.
        </p>
      ) : (
        <ol className="mt-6 space-y-3" aria-label="Health status drivers">
          {reasons.map((reason, index) => (
            <li
              key={`${reason.source}-${reason.code}-${reason.feature ?? index}`}
              className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {reason.source}
                </span>
                <span className="text-slate-600">·</span>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300">
                  {humanizeReasonCode(reason.code)}
                </span>
                {reason.status ? (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">
                      <span aria-hidden className="mr-1">
                        {statusGlyph(reason.status)}
                      </span>
                      {statusLabel(reason.status)}
                    </span>
                  </>
                ) : null}
                {reason.feature ? (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">{reason.feature}</span>
                  </>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-slate-300">{reason.detail}</p>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 rounded-xl border border-white/[0.05] bg-black/20 px-4 py-3 text-xs leading-relaxed text-slate-500">
        Monitoring describes historical model behavior on completed sessions. It is an
        educational diagnostic for calibration and feature stability — not a trading
        recommendation, live signal, or guarantee of future performance.
      </p>
    </GlassCard>
  )
}
