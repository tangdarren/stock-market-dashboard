import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { FadeContent } from '@/features/ui/components/FadeContent'
import { usePageTitle } from '@/hooks/usePageTitle'

import { BacktestSummary } from '@/features/forecast/components/BacktestSummary'
import { ForecastDecisionHero } from '@/features/forecast/components/ForecastDecisionHero'
import { ForecastErrorState } from '@/features/forecast/components/ForecastErrorState'
import { ForecastHistoryTable } from '@/features/forecast/components/ForecastHistoryTable'
import { ForecastSection } from '@/features/forecast/components/ForecastSection'
import { ForecastSkeleton } from '@/features/forecast/components/ForecastSkeleton'
import { HistoricalAnaloguesPanel } from '@/features/forecast/components/HistoricalAnaloguesPanel'
import { MarketConditionsPanel } from '@/features/forecast/components/MarketConditionsPanel'
import { MethodologyPanel } from '@/features/forecast/components/MethodologyPanel'
import { ModelPerformancePanel } from '@/features/forecast/components/ModelPerformancePanel'
import { NewsContextPanel } from '@/features/forecast/components/NewsContextPanel'
import { PageSectionNav } from '@/features/forecast/components/PageSectionNav'
import { PredictionExplanation } from '@/features/forecast/components/PredictionExplanation'

import type { Mode } from '@/features/forecast/api/types'
import {
  demoAnalogues,
  demoForecast,
  demoHistory,
  demoMarket,
  demoMetrics,
  demoNews,
} from '@/features/forecast/demo/demoResponses'
import { useDemoOverride } from '@/features/forecast/hooks/useDemoOverride'
import { useForecastHistory } from '@/features/forecast/hooks/useForecastHistory'
import { useModelMetrics } from '@/features/forecast/hooks/useModelMetrics'
import { useSpyAnalogues } from '@/features/forecast/hooks/useSpyAnalogues'
import { useSpyForecast } from '@/features/forecast/hooks/useSpyForecast'
import { useSpyMarketData } from '@/features/forecast/hooks/useSpyMarketData'
import { useSpyNews } from '@/features/forecast/hooks/useSpyNews'
import { BackendUnavailableError } from '@/lib/api/client'
import { ENV } from '@/lib/api/env'

const SECTION_IDS = {
  outlook: 'outlook',
  conditions: 'market-conditions',
  explanation: 'explanation',
  analogues: 'historical-matches',
  performance: 'performance',
  history: 'forecast-history',
  backtest: 'backtest',
  news: 'news',
  methodology: 'methodology',
} as const

const NAV_ITEMS = [
  { id: SECTION_IDS.outlook, label: 'Outlook' },
  { id: SECTION_IDS.conditions, label: 'Market conditions' },
  { id: SECTION_IDS.explanation, label: 'Explanation' },
  { id: SECTION_IDS.analogues, label: 'Historical matches' },
  { id: SECTION_IDS.performance, label: 'Performance' },
  { id: SECTION_IDS.history, label: 'Forecast history' },
  { id: SECTION_IDS.backtest, label: 'Backtest' },
  { id: SECTION_IDS.methodology, label: 'Methodology' },
]

export function DailyDashboardPage() {
  usePageTitle('SPY Forecast Lab')

  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { enabled: demoOverride, enable: enableDemo, disable: disableDemo } = useDemoOverride()

  const market = useSpyMarketData()
  const forecast = useSpyForecast()
  const metrics = useModelMetrics()
  const history = useForecastHistory(30)
  const news = useSpyNews()
  const analogues = useSpyAnalogues(5)

  const anyLoading = market.isLoading || forecast.isLoading
  const backendUnavailable =
    market.error instanceof BackendUnavailableError ||
    forecast.error instanceof BackendUnavailableError
  const shouldUseDemoFallback = demoOverride || ENV.DEMO_MODE
  const showBackendUnavailableCard = backendUnavailable && !shouldUseDemoFallback

  const marketData = market.data ?? (shouldUseDemoFallback ? demoMarket : undefined)
  const forecastData = forecast.data ?? (shouldUseDemoFallback ? demoForecast : undefined)
  const metricsData = metrics.data ?? (shouldUseDemoFallback ? demoMetrics : undefined)
  const historyData = history.data ?? (shouldUseDemoFallback ? demoHistory : undefined)
  const newsData = news.data ?? (shouldUseDemoFallback ? demoNews : undefined)
  const analoguesData =
    analogues.data ?? (shouldUseDemoFallback ? demoAnalogues : undefined)

  const effectiveMode: Mode = useMemo(() => {
    if (shouldUseDemoFallback) return 'demo'
    return forecastData?.mode ?? marketData?.mode ?? 'unavailable'
  }, [shouldUseDemoFallback, forecastData?.mode, marketData?.mode])

  const modelIsMissing = forecastData?.model_unavailable === true
  const oneDay = forecastData?.one_day ?? null
  const fiveDay = forecastData?.five_day ?? null

  const handleRefresh = async () => {
    if (shouldUseDemoFallback) return
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['forecast-market'] }),
        queryClient.invalidateQueries({ queryKey: ['forecast-spy'] }),
        queryClient.invalidateQueries({ queryKey: ['forecast-history'] }),
        queryClient.invalidateQueries({ queryKey: ['forecast-news'] }),
        queryClient.invalidateQueries({ queryKey: ['forecast-analogues'] }),
      ])
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="min-h-screen pt-24 pb-24">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-0 top-32 h-96 w-96 rounded-full bg-[#00FFB2]/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#00FFB2]/[0.02] blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* ================= Section 1: Current Forecast ================= */}
        <FadeContent delay={0}>
          <section
            id={SECTION_IDS.outlook}
            aria-label="Current forecast"
            className="scroll-mt-24"
          >
            <ForecastDecisionHero
              forecast={forecastData}
              market={marketData}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              effectiveMode={effectiveMode}
              demoBackendUnavailable={backendUnavailable && shouldUseDemoFallback}
              modelUnavailableReason={forecastData?.reason}
              isLoading={anyLoading}
            />
          </section>
        </FadeContent>

        {showBackendUnavailableCard ? (
          <FadeContent delay={80} className="mt-6">
            <ForecastErrorState
              title="Backend unavailable"
              message={
                (market.error instanceof Error && market.error.message) ||
                (forecast.error instanceof Error && forecast.error.message) ||
                'The Forecast Lab API is not reachable right now.'
              }
              reason="backend_unavailable"
              onRetry={handleRefresh}
              onUseDemo={enableDemo}
            />
          </FadeContent>
        ) : null}

        {modelIsMissing && !shouldUseDemoFallback ? (
          <FadeContent delay={80} className="mt-6">
            <ForecastErrorState
              title="Model unavailable"
              message={
                forecastData?.reason ??
                'No trained model artifacts were found. The frontend intentionally does not fabricate a forecast.'
              }
              reason="model_unavailable"
              onRetry={handleRefresh}
              onUseDemo={enableDemo}
            />
          </FadeContent>
        ) : null}

        {/* Section navigation — appears only once real content is available. */}
        {!showBackendUnavailableCard && !anyLoading ? (
          <FadeContent delay={120} className="mt-6">
            <PageSectionNav items={NAV_ITEMS} />
          </FadeContent>
        ) : null}

        {anyLoading && !forecastData && !backendUnavailable ? (
          <div className="mt-8">
            <ForecastSkeleton />
          </div>
        ) : (
          <div className="mt-14 space-y-14 sm:mt-16 sm:space-y-16">
            {/* ============ Section 2: Current Market Conditions ============ */}
            <FadeContent delay={140}>
              <ForecastSection
                id={SECTION_IDS.conditions}
                eyebrow="Section 2"
                title="Current market conditions"
                description="The latest completed SPY session and the indicators used to build the forecast."
              >
                <MarketConditionsPanel market={marketData} />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 3: Why the Model Leans This Way ============ */}
            <FadeContent delay={180}>
              <ForecastSection
                id={SECTION_IDS.explanation}
                eyebrow="Section 3"
                title="Why the model leans this way"
                description="The strongest current factors influencing the model’s probability. Explanations are correlational, not causal."
              >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <PredictionExplanation
                    horizonLabel="1-day outlook"
                    forecast={oneDay}
                  />
                  <PredictionExplanation
                    horizonLabel="5-day outlook"
                    forecast={fiveDay}
                  />
                </div>
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 4: Similar Historical Market Setups ============ */}
            <FadeContent delay={220}>
              <ForecastSection
                id={SECTION_IDS.analogues}
                eyebrow="Section 4"
                title="Similar historical market setups"
                description="Past SPY sessions with the most similar momentum, volatility, price, and volume conditions. Descriptive only — not a prediction."
              >
                <HistoricalAnaloguesPanel
                  data={analoguesData}
                  isLoading={analogues.isLoading}
                  error={
                    !shouldUseDemoFallback && !analogues.data ? analogues.error : undefined
                  }
                  // Derive from the payload's own mode so a stale
                  // demo-override localStorage flag can't mislabel a real live
                  // response as demo data if the backend has come back up.
                  isDemo={analoguesData?.mode === 'demo'}
                />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 5: How Reliable Has the Model Been? ============ */}
            <FadeContent delay={260}>
              <ForecastSection
                id={SECTION_IDS.performance}
                eyebrow="Section 5"
                title="How reliable has the model been?"
                description="Out-of-sample performance compared with simple forecasting baselines."
              >
                <ModelPerformancePanel metrics={metricsData} />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 6: Historical Forecast Review ============ */}
            <FadeContent delay={300}>
              <ForecastSection
                id={SECTION_IDS.history}
                eyebrow="Section 6"
                title="Historical forecast review"
                description="Recent out-of-sample forecasts, the actual outcomes, and the realized return."
              >
                <ForecastHistoryTable records={historyData?.records ?? []} />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 7: Educational Backtest ============ */}
            <FadeContent delay={340}>
              <ForecastSection
                id={SECTION_IDS.backtest}
                eyebrow="Section 7"
                title="Educational strategy simulation"
                description="A simple, transparent rule that goes long SPY when the model is confident enough — and holds cash otherwise."
              >
                <BacktestSummary backtest={metricsData?.horizons?.['1d']?.backtest} />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 8: News Context ============ */}
            <FadeContent delay={380}>
              <ForecastSection
                id={SECTION_IDS.news}
                eyebrow="Section 8"
                title="Current news context"
                description="Current news context is displayed separately and is not used by the forecasting model."
              >
                <NewsContextPanel news={newsData} />
              </ForecastSection>
            </FadeContent>

            {/* ============ Section 9: Methodology & Limitations ============ */}
            <FadeContent delay={420}>
              <ForecastSection
                id={SECTION_IDS.methodology}
                eyebrow="Section 9"
                title="Methodology and limitations"
                description="How the model is built, validated, and what it explicitly does not do."
              >
                <MethodologyPanel metrics={metricsData} />
              </ForecastSection>
            </FadeContent>

            {shouldUseDemoFallback && backendUnavailable ? (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={disableDemo}
                  className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-xs text-slate-300 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60"
                >
                  Turn off sample data
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
