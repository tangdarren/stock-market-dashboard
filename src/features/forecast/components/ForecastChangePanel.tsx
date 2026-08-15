import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { BackendUnavailableError } from '@/lib/api/client'
import { cn } from '@/lib/utils/cn'
import type { ForecastResponse, Mode, WalkForwardRecord } from '../api/types'
import {
  compareForecastToPrevious,
  type ConfidenceChange,
  type HorizonForecastComparison,
} from '../utils/compareForecasts'
import { confidenceCopy } from '../utils/confidence'
import { formatDate, formatProbability } from '../utils/format'
import { SkeletonBlock } from './ForecastSkeleton'

interface ForecastChangePanelProps {
  forecast?: ForecastResponse | null
  historyRecords?: readonly WalkForwardRecord[] | null
  isLoading?: boolean
  error?: unknown
  /** When true, label the comparison as demo/sample data. */
  isDemo?: boolean
  /** When true, label the comparison as simulated workbook data. */
  isSimulated?: boolean
  /** When true, the current forecast itself is unavailable. */
  modelUnavailable?: boolean
  effectiveMode?: Mode
}

const PANEL_DISCLAIMER =
  'A change in the model’s bullish probability is not a prediction that the market will move that way. Probabilities remain educational estimates.'

/**
 * Compares the latest 1-day and 5-day SPY forecasts with the most recent prior
 * walk-forward forecasts. Descriptive only — does not imply market direction.
 */
export function ForecastChangePanel({
  forecast,
  historyRecords,
  isLoading = false,
  error,
  isDemo = false,
  isSimulated = false,
  modelUnavailable = false,
  effectiveMode,
}: ForecastChangePanelProps) {
  if (isLoading && !forecast) {
    return <LoadingState />
  }

  if (error && !forecast) {
    return <ErrorState error={error} />
  }

  if (modelUnavailable || forecast?.model_unavailable) {
    return (
      <StatusCard
        title="Forecast change unavailable"
        message="No trained model forecast is available to compare against prior history."
      />
    )
  }

  if (!forecast?.one_day && !forecast?.five_day) {
    return (
      <StatusCard
        title="Forecast change unavailable"
        message="The current SPY outlook has not loaded, so a previous-versus-current comparison cannot be shown."
      />
    )
  }

  if (isLoading && !historyRecords?.length) {
    return <LoadingState />
  }

  if (error && !historyRecords?.length) {
    return <ErrorState error={error} />
  }

  const comparison = compareForecastToPrevious(forecast, historyRecords)
  const hasAny = comparison.oneDay != null || comparison.fiveDay != null

  if (!hasAny) {
    return (
      <StatusCard
        title="Previous forecast history unavailable"
        message="A prior walk-forward forecast for these horizons was not found, so the change versus the previous outlook cannot be calculated yet."
      />
    )
  }

  const demo = isDemo || effectiveMode === 'demo' || forecast.mode === 'demo'
  const simulated =
    (isSimulated || effectiveMode === 'simulated' || forecast.mode === 'simulated') && !demo

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#00FFB2]/80">
            Versus previous forecast
          </p>
          <p className="text-sm text-slate-300">
            How the model’s probability of SPY finishing higher moved since the
            prior scored forecast for each horizon.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demo ? <DemoPill /> : null}
          {simulated ? <SimulatedPill /> : null}
          <Badge variant="neutral">Educational</Badge>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <HorizonChangeCard
          label="1-day outlook"
          comparison={comparison.oneDay}
          missingCopy="No earlier 1-day forecast was found in history for comparison."
        />
        <HorizonChangeCard
          label="5-day outlook"
          comparison={comparison.fiveDay}
          missingCopy="No earlier 5-day forecast was found in history for comparison."
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">{PANEL_DISCLAIMER}</p>
    </GlassCard>
  )
}

function HorizonChangeCard({
  label,
  comparison,
  missingCopy,
}: {
  label: string
  comparison: HorizonForecastComparison | null
  missingCopy: string
}) {
  if (!comparison) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        <p className="mt-3 text-sm text-slate-400">{missingCopy}</p>
      </div>
    )
  }

  const changeTone =
    comparison.probUpChangePp > 0.05
      ? 'up'
      : comparison.probUpChangePp < -0.05
        ? 'down'
        : 'flat'

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </p>
        <ConfidenceChangeBadge change={comparison.confidenceChange} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="Previous P(up)"
          value={formatProbability(comparison.previousProbUp)}
          hint={formatDate(comparison.previousDate)}
        />
        <Stat
          label="Current P(up)"
          value={formatProbability(comparison.currentProbUp)}
        />
        <Stat
          label="Change"
          value={formatPpChange(comparison.probUpChangePp)}
          valueClassName={
            changeTone === 'up'
              ? 'text-[#00FFB2]'
              : changeTone === 'down'
                ? 'text-red-400'
                : 'text-slate-200'
          }
        />
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Model confidence {confidenceChangeCopy(comparison.confidenceChange)} (
        {confidenceCopy(comparison.previousConfidence).toLowerCase()} →{' '}
        {confidenceCopy(comparison.currentConfidence).toLowerCase()}). This
        describes conviction in the probability estimate, not a market call.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className={cn('mt-1 font-mono text-sm font-semibold text-slate-100', valueClassName)}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  )
}

function ConfidenceChangeBadge({ change }: { change: ConfidenceChange }) {
  const map: Record<
    ConfidenceChange,
    { label: string; variant: 'success' | 'danger' | 'neutral' }
  > = {
    increased: { label: 'Confidence increased', variant: 'success' },
    decreased: { label: 'Confidence decreased', variant: 'danger' },
    unchanged: { label: 'Confidence stable', variant: 'neutral' },
  }
  const info = map[change]
  return <Badge variant={info.variant}>{info.label}</Badge>
}

function confidenceChangeCopy(change: ConfidenceChange): string {
  switch (change) {
    case 'increased':
      return 'increased'
    case 'decreased':
      return 'decreased'
    case 'unchanged':
      return 'stayed approximately stable'
  }
}

function formatPpChange(pp: number): string {
  if (!Number.isFinite(pp)) return '—'
  const sign = pp > 0 ? '+' : ''
  return `${sign}${pp.toFixed(1)} pp`
}

function StatusCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-sm text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{message}</p>
      <p className="mt-3 text-[11px] text-slate-500">{PANEL_DISCLAIMER}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading forecast change comparison…</span>
      <GlassCard className="p-5 sm:p-6">
        <SkeletonBlock height="h-3" className="w-40" />
        <SkeletonBlock height="h-4" className="mt-3 w-3/4" />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <SkeletonBlock height="h-36" />
          <SkeletonBlock height="h-36" />
        </div>
      </GlassCard>
    </div>
  )
}

function ErrorState({ error }: { error: unknown }) {
  const isNetwork = error instanceof BackendUnavailableError
  const message = isNetwork
    ? 'Forecast history is unavailable because the backend cannot be reached right now.'
    : error instanceof Error && error.message
      ? error.message
      : 'Forecast history could not be loaded right now.'

  return (
    <StatusCard title="Forecast change unavailable" message={message} />
  )
}

function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
      <span aria-hidden>◆</span>
      Demo data — sample comparison
    </span>
  )
}

function SimulatedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#00FFB2]/30 bg-[#00FFB2]/10 px-2 py-0.5 text-[11px] font-medium text-[#00FFB2]">
      Simulated comparison — fictional scenario
    </span>
  )
}
