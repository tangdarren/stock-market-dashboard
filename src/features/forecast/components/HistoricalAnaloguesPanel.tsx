import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import { BackendUnavailableError } from '@/lib/api/client'
import { AnalogueValidationError } from '../api/analogueSchema'
import type { AnalogueRecord, AnalogueResponse } from '../api/types'
import {
  buildAnalogueSummarySentence,
  formatPositiveShare,
  formatSignedPercent,
} from '../utils/analogueSummary'
import { formatDate } from '../utils/format'
import { DirectionIcon } from './DirectionIcon'
import { SkeletonBlock } from './ForecastSkeleton'

interface HistoricalAnaloguesPanelProps {
  data?: AnalogueResponse
  isLoading?: boolean
  error?: unknown
  /**
   * When true the panel treats the data as demo/sample and renders a visible
   * badge so the user is never misled into thinking the analogues are live.
   */
  isDemo?: boolean
}

const PANEL_DISCLAIMER =
  'Historical similarity does not imply the same future outcome.'

/**
 * Descriptive panel — NOT a forecast. Renders the top-N most similar historical
 * SPY sessions to the latest completed session, alongside their subsequent
 * realized returns, so a reader can see what kind of environment the model is
 * currently operating in. Truthful about all failure modes: a broken analogue
 * endpoint must not take down the rest of the Forecast Lab page.
 */
export function HistoricalAnaloguesPanel({
  data,
  isLoading,
  error,
  isDemo,
}: HistoricalAnaloguesPanelProps) {
  if (isLoading && !data) {
    return <LoadingState />
  }
  if (error) {
    return <ErrorState error={error} />
  }
  if (!data || !data.available) {
    return <UnavailableState reason={data?.reason} detail={data?.detail} />
  }

  const analogues = data.analogues
  const summary = data.summary
  const sentence = buildAnalogueSummarySentence(data)
  const disclaimer = data.disclaimer || PANEL_DISCLAIMER
  const isStale = data.mode === 'stale'

  if (analogues.length === 0) {
    return <UnavailableState reason="insufficient_observations" detail={sentence} />
  }

  return (
    <div className="space-y-6">
      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p
              className="max-w-3xl text-base text-slate-100 sm:text-lg"
              data-testid="historical-analogues-summary"
            >
              {sentence}
            </p>
            <p className="text-xs text-slate-500">
              Query session:{' '}
              <span className="font-mono text-slate-300">
                {formatDate(data.query_date ?? data.features_as_of)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {isDemo ? <DemoPill /> : null}
            {isStale ? <StalePill /> : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryStat
            label="Similar sessions"
            value={String(summary?.analogue_count ?? analogues.length)}
          />
          <SummaryStat
            label="Positive next day"
            value={formatPositiveShare(summary?.positive_after_1d_pct ?? null, summary)}
          />
          <SummaryStat
            label="Positive after 5d"
            value={formatPositiveShare(summary?.positive_after_5d_pct ?? null, summary)}
          />
          <SummaryStat
            label="Median 1d return"
            value={formatSignedPercent(summary?.median_return_1d ?? null)}
            hint={`Avg ${formatSignedPercent(summary?.avg_return_1d ?? null)}`}
          />
        </dl>
      </GlassCard>

      <ul
        aria-label="Historical analogue sessions"
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {analogues.map((a) => (
          <li key={a.date}>
            <AnalogueCard
              record={a}
              featureCount={data.methodology?.features?.length ?? 0}
              separationDays={data.methodology?.minimum_separation_days ?? 0}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-500">
        <span aria-hidden className="mr-1">•</span>
        {disclaimer}
        {data.methodology?.candidate_pool_size ? (
          <span className="ml-1 text-slate-600">
            (Method: standardized-feature nearest neighbors on{' '}
            {data.methodology.candidate_pool_size.toLocaleString()} eligible historical sessions;
            temporal separation ≥ {data.methodology.minimum_separation_days} days.)
          </span>
        ) : null}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual analogue card
// ---------------------------------------------------------------------------

function AnalogueCard({
  record,
  featureCount,
  separationDays,
}: {
  record: AnalogueRecord
  featureCount: number
  separationDays: number
}) {
  const detailsId = `analogue-${record.date}-details`
  return (
    <article
      aria-labelledby={`analogue-${record.date}-heading`}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Historical match
          </p>
          <h3
            id={`analogue-${record.date}-heading`}
            className="mt-1 font-mono text-base font-semibold text-white"
          >
            {formatDate(record.date)}
          </h3>
        </div>
        <SimilarityPill value={record.similarity} />
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <OutcomeCell
          label="Next session"
          direction={record.direction_1d}
          value={formatSignedPercent(record.return_1d)}
        />
        <OutcomeCell
          label="Five sessions later"
          direction={record.direction_5d}
          value={formatSignedPercent(record.return_5d)}
        />
        <ContextCell label="RSI (14)" value={formatOptional(record.rsi_14, 1)} />
        <ContextCell
          label="20d volatility"
          value={formatOptionalPercent(record.rolling_vol_20, 2)}
        />
        <ContextCell
          label="Relative volume"
          value={record.relative_volume != null ? `${record.relative_volume.toFixed(2)}×` : '—'}
        />
        <ContextCell
          label="Distance from 20d MA"
          value={formatOptionalPercent(record.distance_from_sma_20, 2)}
        />
      </dl>

      <details className="group mt-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
        <summary
          aria-controls={detailsId}
          className={cn(
            'flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-slate-400',
            'hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
            '[&::-webkit-details-marker]:hidden',
          )}
        >
          <span>Why this day matched</span>
          <span aria-hidden className="text-slate-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div id={detailsId} className="border-t border-white/[0.04] px-3 py-3 text-xs text-slate-400">
          <p>
            This session was closest in a standardized{' '}
            {featureCount > 0 ? `${featureCount}-feature` : 'multi-feature'} space — the
            same features used by the forecasting models — after excluding
            sessions within {separationDays > 0 ? separationDays : 20} days of
            the query date and any session whose 5-day realized outcome was
            not yet observable.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            <MetaCell label="Close price" value={`$${formatNumber(record.close, 2)}`} />
            <MetaCell label="Raw distance" value={formatNumber(record.distance, 3)} />
            <MetaCell
              label="Similarity"
              value={`${record.similarity.toFixed(1)} / 100`}
            />
          </dl>
          <p className="mt-3 text-[11px] text-slate-500">
            Descriptive only — not a prediction.
          </p>
        </div>
      </details>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function SimilarityPill({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-right"
      role="group"
      aria-label={`Similarity ${pct.toFixed(1)} out of 100`}
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-500">Similarity</p>
      <p className="font-mono text-sm font-semibold text-slate-100">
        {pct.toFixed(1)}
        <span className="ml-0.5 text-xs text-slate-500">/100</span>
      </p>
    </div>
  )
}

function OutcomeCell({
  label,
  direction,
  value,
}: {
  label: string
  direction: 'up' | 'down'
  value: string
}) {
  const directionLabel = direction === 'up' ? 'Higher' : 'Lower'
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <DirectionIcon direction={direction} size="sm" />
        <div className="min-w-0">
          <p
            className={cn(
              'text-sm font-semibold',
              direction === 'up' ? 'text-[#00FFB2]' : 'text-red-400',
            )}
          >
            <span className="sr-only">Realized outcome: </span>
            {directionLabel}
          </p>
          <p className="font-mono text-xs text-slate-400">{value}</p>
        </div>
      </div>
    </div>
  )
}

function ContextCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm text-slate-200">{value}</p>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-xs text-slate-300">{value}</dd>
    </div>
  )
}

function SummaryStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
      <span aria-hidden>◆</span>
      Demo data — sample analogues
    </span>
  )
}

function StalePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] font-medium text-yellow-200">
      Stale cache
    </span>
  )
}

// ---------------------------------------------------------------------------
// Non-happy states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4"
    >
      <span className="sr-only">Loading historical analogue sessions…</span>
      <GlassCard className="p-5 sm:p-6">
        <SkeletonBlock height="h-4" className="w-40" />
        <SkeletonBlock height="h-6" className="mt-3 w-3/4" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height="h-14" />
          ))}
        </div>
      </GlassCard>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} height="h-40" />
        ))}
      </div>
    </div>
  )
}

function ErrorState({ error }: { error: unknown }) {
  const isNetwork = error instanceof BackendUnavailableError
  const isValidation = error instanceof AnalogueValidationError
  const message = isNetwork
    ? 'Historical analogues are unavailable because the backend cannot be reached right now.'
    : isValidation
      ? 'Historical analogues returned in an unexpected shape and were withheld to avoid displaying misleading data.'
      : error instanceof Error && error.message
        ? error.message
        : 'Historical analogues could not be loaded right now.'

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-sm text-slate-200">
        Historical analogues aren&apos;t available.
      </p>
      <p className="mt-1 text-xs text-slate-500">{message}</p>
      <p className="mt-3 text-[11px] text-slate-500">
        {PANEL_DISCLAIMER}
      </p>
    </div>
  )
}

function UnavailableState({ reason, detail }: { reason?: string; detail?: string }) {
  const friendly = reasonToCopy(reason)
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-sm text-slate-200">
        Historical analogues aren&apos;t available for this session.
      </p>
      <p className="mt-1 text-xs text-slate-500">{friendly}</p>
      {detail ? <p className="mt-1 text-[11px] text-slate-600">{detail}</p> : null}
      <p className="mt-3 text-[11px] text-slate-500">
        {PANEL_DISCLAIMER}
      </p>
    </div>
  )
}

function reasonToCopy(reason?: string): string {
  switch (reason) {
    case 'historical_dataset_missing':
      return 'The local historical SPY dataset has not been bootstrapped yet.'
    case 'historical_dataset_malformed':
      return 'The local historical SPY dataset could not be read.'
    case 'market_data_unavailable':
      return 'The latest completed-session snapshot is unavailable, so no query vector could be built.'
    case 'insufficient_history':
      return 'The recent market history is too short to build a complete feature row.'
    case 'insufficient_observations':
      return 'Not enough eligible historical sessions to compute analogues for this query.'
    case 'feature_schema_mismatch':
      return 'The historical dataset does not match the expected feature schema.'
    default:
      return 'The analogue engine reported no eligible matches for this session.'
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers local to this panel
// ---------------------------------------------------------------------------

function formatOptional(value: number | null, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}

function formatOptionalPercent(value: number | null, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(decimals)
}
