import { GlassCard } from '@/features/ui/components/GlassCard'
import { Badge } from '@/components/common/Badge'
import { ModeBadge } from './ModeBadge'
import type { ForecastResponse, MarketResponse, Mode } from '../api/types'
import { formatDate, formatDateTime } from '../utils/format'

interface ForecastHeroProps {
  forecast?: ForecastResponse
  market?: MarketResponse
  onRefresh?: () => void
  isRefreshing?: boolean
  effectiveMode: Mode
  demoBackendUnavailable?: boolean
}

export function ForecastHero({
  forecast,
  market,
  onRefresh,
  isRefreshing = false,
  effectiveMode,
  demoBackendUnavailable = false,
}: ForecastHeroProps) {
  const featuresAsOf = forecast?.features_as_of ?? market?.features_as_of ?? null
  const dataAsOf = market?.data_as_of ?? forecast?.data_as_of ?? null
  const trainedAt =
    forecast?.one_day?.trained_at ?? forecast?.five_day?.trained_at ?? null
  const modelVersion = forecast?.model_version ?? null

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
              Market
            </p>
            <Badge variant="info">Educational analysis</Badge>
            <ModeBadge mode={effectiveMode} />
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            SPY Forecast Lab
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Explainable one-day and five-day SPY direction forecasts built from
            historical price, momentum, volatility, and volume patterns.
          </p>

          {featuresAsOf ? (
            <p className="text-sm text-slate-300">
              Features based on the latest completed trading session:{' '}
              <span className="font-semibold text-white">{formatDate(featuresAsOf)}</span>
            </p>
          ) : null}

          <p className="text-xs text-slate-500">
            Model output is probabilistic and may be wrong. It is not financial
            advice.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
          <button
            type="button"
            onClick={onRefresh}
            disabled={!onRefresh || isRefreshing || demoBackendUnavailable}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40 lg:self-end"
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
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>

          <dl className="grid gap-1 text-right text-xs text-slate-500">
            <div>
              <dt className="inline">Data as of </dt>
              <dd className="inline font-medium text-slate-300">
                {dataAsOf ? formatDate(dataAsOf) : '—'}
              </dd>
            </div>
            <div>
              <dt className="inline">Model trained </dt>
              <dd className="inline font-medium text-slate-300">
                {trainedAt ? formatDateTime(trainedAt) : '—'}
              </dd>
            </div>
            {modelVersion ? (
              <div>
                <dt className="inline">Version </dt>
                <dd className="inline font-mono font-medium text-slate-300">
                  {modelVersion}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {demoBackendUnavailable ? (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4">
          <p className="text-sm font-semibold text-amber-300">
            Demo data — backend unavailable
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            You&apos;re viewing sample values so the layout can render. Every panel
            is labelled. Turn this off from your browser DevTools by clearing
            <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5">
              localStorage.spy-forecast-lab:demo-override
            </code>{' '}
            once the backend is running.
          </p>
        </div>
      ) : null}
    </GlassCard>
  )
}
