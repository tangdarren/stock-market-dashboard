import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import type {
  ForecastResponse,
  HorizonForecast,
  MarketResponse,
  Mode,
} from '../api/types'
import { formatDate, formatDateTime, formatPrice } from '../utils/format'
import {
  buildInterpretationSentence,
  computeHorizonOutlook,
  type HorizonOutlook,
} from '../utils/interpretation'
import { DirectionIcon } from './DirectionIcon'
import { ModeBadge } from './ModeBadge'
import { ProbabilityBar } from './ProbabilityBar'

interface ForecastDecisionHeroProps {
  forecast?: ForecastResponse
  market?: MarketResponse
  onRefresh?: () => void
  isRefreshing?: boolean
  effectiveMode: Mode
  demoBackendUnavailable?: boolean
  modelUnavailableReason?: string
  isLoading?: boolean
}

/**
 * Top-of-page prediction summary. Answers "what does the model currently
 * predict?" within a few seconds. Includes truthful states for backend
 * unavailable, model unavailable, and demo / stale data.
 */
export function ForecastDecisionHero({
  forecast,
  market,
  onRefresh,
  isRefreshing = false,
  effectiveMode,
  demoBackendUnavailable = false,
  modelUnavailableReason,
  isLoading = false,
}: ForecastDecisionHeroProps) {
  const oneDayOutlook = computeHorizonOutlook(forecast?.one_day ?? null)
  const fiveDayOutlook = computeHorizonOutlook(forecast?.five_day ?? null)

  const featuresAsOf = forecast?.features_as_of ?? market?.features_as_of ?? null
  const dataAsOf = market?.data_as_of ?? forecast?.data_as_of ?? null
  const modelVersion = forecast?.model_version ?? null
  const modelName =
    forecast?.one_day?.model_name ?? forecast?.five_day?.model_name ?? null
  const latestClose = market?.latest?.close ?? null
  const modelIsMissing = forecast?.model_unavailable === true

  const interpretation = buildInterpretationSentence(oneDayOutlook, fiveDayOutlook)

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#00FFB2]/80">
              SPY market outlook
            </p>
            <Badge variant="info">Educational analysis</Badge>
            <ModeBadge mode={effectiveMode} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            What the model currently predicts
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            A probabilistic direction outlook for SPY over the next trading day
            and the next five trading sessions, derived from historical price,
            momentum, volatility and volume patterns.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!onRefresh || isRefreshing || demoBackendUnavailable}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60"
            aria-label="Refresh forecast data"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          {latestClose != null ? (
            <p className="text-xs text-slate-500 sm:text-right">
              SPY last close{' '}
              <span className="font-mono font-medium text-slate-200">
                ${formatPrice(latestClose)}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {/* --- Prediction body ------------------------------------------------ */}
      <div className="mt-6">
        {modelIsMissing ? (
          <ModelUnavailableBanner reason={modelUnavailableReason ?? forecast?.reason} />
        ) : isLoading && !oneDayOutlook && !fiveDayOutlook ? (
          <LoadingBanner />
        ) : !oneDayOutlook && !fiveDayOutlook ? (
          <ModelUnavailableBanner reason={forecast?.reason ?? 'No forecast is available right now.'} />
        ) : (
          <>
            <p
              className="text-base text-slate-100 sm:text-lg"
              data-testid="forecast-interpretation"
            >
              {interpretation}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <HorizonBlock
                label="Next trading day"
                outlook={oneDayOutlook}
                forecast={forecast?.one_day ?? null}
              />
              <HorizonBlock
                label="Next five trading sessions"
                outlook={fiveDayOutlook}
                forecast={forecast?.five_day ?? null}
              />
            </div>
          </>
        )}
      </div>

      {/* --- Metadata footer ------------------------------------------------- */}
      <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-white/[0.05] pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetaItem
          label="Latest completed session"
          value={featuresAsOf ? formatDate(featuresAsOf) : '—'}
          hint="Used to build the current feature row."
        />
        <MetaItem
          label="Market data as of"
          value={dataAsOf ? formatDate(dataAsOf) : '—'}
          hint={
            effectiveMode === 'stale'
              ? 'Backend served the last successful cached response.'
              : effectiveMode === 'demo'
                ? 'Sample fixture; not live data.'
                : undefined
          }
        />
        <MetaItem
          label="Selected model"
          value={modelName ? formatModelName(modelName) : '—'}
        />
        <MetaItem
          label="Model version"
          value={modelVersion ?? '—'}
          mono
          hint={
            forecast?.one_day?.trained_at
              ? `Trained ${formatDateTime(forecast.one_day.trained_at)}`
              : undefined
          }
        />
      </dl>

      <p className="mt-5 text-xs text-slate-500">
        Model output is probabilistic and may be wrong. This is an educational
        analysis, not financial advice.
      </p>

      {demoBackendUnavailable ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
          <p className="text-sm font-semibold text-amber-300">
            Demo data — backend unavailable
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            You&apos;re viewing sample values so the layout can render. Every
            panel that uses these numbers is labelled. Turn this off from the
            control at the bottom of the page once the backend is running.
          </p>
        </div>
      ) : null}
    </GlassCard>
  )
}

// -----------------------------------------------------------------------------

interface HorizonBlockProps {
  label: string
  outlook: HorizonOutlook | null
  forecast: HorizonForecast | null
}

function HorizonBlock({ label, outlook, forecast }: HorizonBlockProps) {
  if (!outlook || !forecast) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Prediction unavailable for this horizon.
        </p>
      </div>
    )
  }

  const isNeutral = outlook.lean === 'neutral'
  const accentText =
    outlook.lean === 'up'
      ? 'text-[#00FFB2]'
      : outlook.lean === 'down'
        ? 'text-red-400'
        : 'text-slate-200'

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <ConfidenceBadge outlook={outlook} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        {isNeutral ? (
          <NeutralIcon />
        ) : (
          <DirectionIcon direction={outlook.lean === 'up' ? 'up' : 'down'} size="lg" />
        )}
        <div className="min-w-0">
          <p className={cn('text-lg font-semibold sm:text-xl', accentText)}>
            {outlook.headline}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {outlook.confidenceCopy}
          </p>
        </div>
      </div>

      <ProbabilityBar
        probUp={outlook.probUp}
        className="mt-4"
        label={`${label} — probability up vs down`}
      />
    </div>
  )
}

function ConfidenceBadge({ outlook }: { outlook: HorizonOutlook }) {
  const map = {
    none: { text: 'Low confidence', variant: 'neutral' as const },
    slight: { text: 'Low confidence', variant: 'neutral' as const },
    moderate: { text: 'Moderate confidence', variant: 'info' as const },
    strong: { text: 'Higher confidence', variant: 'success' as const },
  }
  const cfg = map[outlook.strength]
  return <Badge variant={cfg.variant}>{cfg.text}</Badge>
}

function NeutralIcon() {
  return (
    <svg
      role="img"
      aria-label="Direction: no strong edge"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-slate-300"
    >
      <path d="M5 12h14" />
      <path d="M14 7l5 5-5 5" />
      <path d="M10 7L5 12l5 5" opacity={0.5} />
    </svg>
  )
}

function ModelUnavailableBanner({ reason }: { reason?: string | null }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-5">
      <p className="text-sm font-semibold text-red-300">
        Model unavailable — no forecast to display
      </p>
      <p className="mt-1.5 text-xs text-red-200/80">
        {reason ??
          'The backend reported that no trained model artifacts are currently loaded. The dashboard intentionally does not fabricate a forecast.'}
      </p>
    </div>
  )
}

function LoadingBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-sm text-slate-400"
    >
      Loading the latest forecast…
    </div>
  )
}

function MetaItem({
  label,
  value,
  hint,
  mono = false,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-sm font-medium text-slate-200',
          mono && 'font-mono',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  )
}

function formatModelName(name: string): string {
  return name
    .split(/[_\s]+/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}
