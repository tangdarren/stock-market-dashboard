import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { ConfidenceVersusAccuracy } from '../api/types'
import {
  CONFIDENCE_GAP_WATCH,
  confidenceReliabilityExplanation,
  confidenceReliabilityKind,
  formatPercentScore,
  statusBadgeVariant,
  statusGlyph,
  statusLabel,
} from '../utils/format'

interface MonitorConfidenceReliabilityProps {
  confidence: ConfidenceVersusAccuracy | null
}

export function MonitorConfidenceReliability({
  confidence,
}: MonitorConfidenceReliabilityProps) {
  const kind = confidenceReliabilityKind(confidence?.gap ?? null)
  const kindLabel =
    kind === 'overconfident'
      ? 'Overconfident'
      : kind === 'underconfident'
        ? 'Underconfident'
        : kind === 'well_calibrated'
          ? 'Well aligned'
          : 'Unavailable'

  const kindVariant =
    kind === 'overconfident'
      ? 'warning'
      : kind === 'underconfident'
        ? 'info'
        : kind === 'well_calibrated'
          ? 'success'
          : 'neutral'

  const confidencePct = confidence
    ? Math.max(0, Math.min(100, confidence.average_predicted_confidence * 100))
    : 0
  const accuracyPct = confidence
    ? Math.max(0, Math.min(100, confidence.actual_accuracy * 100))
    : 0

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
            Confidence reliability
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Confidence versus actual accuracy
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Compares how sure the model sounded with how often it was right in the latest
            window. Gaps beyond {formatPercentScore(CONFIDENCE_GAP_WATCH)} enter the watch
            band.
          </p>
        </div>
        {confidence ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant={kindVariant} dot>
              {kindLabel}
            </Badge>
            <Badge variant={statusBadgeVariant(confidence.status)} dot>
              <span aria-hidden className="mr-1">
                {statusGlyph(confidence.status)}
              </span>
              {statusLabel(confidence.status)}
            </Badge>
          </div>
        ) : null}
      </div>

      {!confidence ? (
        <p className="mt-8 text-sm text-slate-500">
          Confidence and accuracy are unavailable for this selection.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-slate-300">
            {confidenceReliabilityExplanation(
              confidence.gap,
              confidence.average_predicted_confidence,
              confidence.actual_accuracy,
            )}
          </p>

          <div
            className="space-y-4"
            role="group"
            aria-label="Confidence and accuracy comparison"
          >
            <ComparisonBar
              label="Average predicted confidence"
              valueLabel={formatPercentScore(confidence.average_predicted_confidence)}
              widthPct={confidencePct}
              tone="confidence"
            />
            <ComparisonBar
              label="Actual accuracy"
              valueLabel={formatPercentScore(confidence.actual_accuracy)}
              widthPct={accuracyPct}
              tone="accuracy"
            />
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Confidence"
              value={formatPercentScore(confidence.average_predicted_confidence)}
            />
            <Stat label="Accuracy" value={formatPercentScore(confidence.actual_accuracy)} />
            <Stat
              label="Gap"
              value={`${confidence.gap > 0 ? '+' : ''}${formatPercentScore(confidence.gap)}`}
            />
          </dl>
        </div>
      )}
    </GlassCard>
  )
}

function ComparisonBar({
  label,
  valueLabel,
  widthPct,
  tone,
}: {
  label: string
  valueLabel: string
  widthPct: number
  tone: 'confidence' | 'accuracy'
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium tabular-nums text-slate-100">{valueLabel}</span>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(widthPct * 10) / 10}
        aria-label={label}
        aria-valuetext={valueLabel}
      >
        <div
          className={
            tone === 'confidence'
              ? 'h-full rounded-full bg-[#00FFB2]/80'
              : 'h-full rounded-full bg-sky-400/80'
          }
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</dd>
    </div>
  )
}
