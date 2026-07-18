import { FadeContent } from '@/features/ui/components/FadeContent'
import { usePageTitle } from '@/hooks/usePageTitle'

import { BacktestSummary } from '@/features/forecast/components/BacktestSummary'
import { ForecastErrorState } from '@/features/forecast/components/ForecastErrorState'
import { ForecastHero } from '@/features/forecast/components/ForecastHero'
import { ForecastHistoryTable } from '@/features/forecast/components/ForecastHistoryTable'
import { ForecastProbabilityCard } from '@/features/forecast/components/ForecastProbabilityCard'
import { ForecastSkeleton } from '@/features/forecast/components/ForecastSkeleton'
import { MarketSnapshotRow } from '@/features/forecast/components/MarketSnapshotRow'
import { MethodologyPanel } from '@/features/forecast/components/MethodologyPanel'
import { ModelPerformancePanel } from '@/features/forecast/components/ModelPerformancePanel'
import { NewsContextPanel } from '@/features/forecast/components/NewsContextPanel'
import { PredictionExplanation } from '@/features/forecast/components/PredictionExplanation'
import { PriceHistoryChart } from '@/features/forecast/components/PriceHistoryChart'

import {
  demoForecast,
  demoHistory,
  demoMarket,
  demoMetrics,
  demoNews,
} from '@/features/forecast/demo/demoResponses'
import { useDemoOverride } from '@/features/forecast/hooks/useDemoOverride'
import { useForecastHistory } from '@/features/forecast/hooks/useForecastHistory'
import { useModelMetrics } from '@/features/forecast/hooks/useModelMetrics'
import { useSpyForecast } from '@/features/forecast/hooks/useSpyForecast'
import { useSpyMarketData } from '@/features/forecast/hooks/useSpyMarketData'
import { useSpyNews } from '@/features/forecast/hooks/useSpyNews'
import { BackendUnavailableError } from '@/lib/api/client'
import { ENV } from '@/lib/api/env'
import type { Mode } from '@/features/forecast/api/types'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

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

  const anyLoading = market.isLoading || forecast.isLoading
  const backendUnavailable =
    (market.error instanceof BackendUnavailableError) ||
    (forecast.error instanceof BackendUnavailableError)
  const shouldUseDemoFallback = demoOverride || ENV.DEMO_MODE
  const showBackendUnavailableCard = backendUnavailable && !shouldUseDemoFallback

  const marketData = market.data ?? (shouldUseDemoFallback ? demoMarket : undefined)
  const forecastData = forecast.data ?? (shouldUseDemoFallback ? demoForecast : undefined)
  const metricsData = metrics.data ?? (shouldUseDemoFallback ? demoMetrics : undefined)
  const historyData = history.data ?? (shouldUseDemoFallback ? demoHistory : undefined)
  const newsData = news.data ?? (shouldUseDemoFallback ? demoNews : undefined)

  const effectiveMode: Mode = shouldUseDemoFallback
    ? 'demo'
    : forecastData?.mode ?? marketData?.mode ?? 'unavailable'

  const modelIsMissing = forecastData?.model_unavailable === true
  const oneDay = forecastData?.one_day ?? null
  const fiveDay = forecastData?.five_day ?? null

  const handleRefresh = async () => {
    if (shouldUseDemoFallback) return
    setIsRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: ['forecast-market'] })
      await queryClient.invalidateQueries({ queryKey: ['forecast-spy'] })
      await queryClient.invalidateQueries({ queryKey: ['forecast-history'] })
      await queryClient.invalidateQueries({ queryKey: ['forecast-news'] })
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

      <div className="mx-auto max-w-7xl space-y-8 px-6 lg:px-8">
        <FadeContent delay={0}>
          <ForecastHero
            forecast={forecastData}
            market={marketData}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            effectiveMode={effectiveMode}
            demoBackendUnavailable={backendUnavailable && shouldUseDemoFallback}
          />
        </FadeContent>

        {showBackendUnavailableCard ? (
          <FadeContent delay={80}>
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
          <FadeContent delay={80}>
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

        {anyLoading && !forecastData && !backendUnavailable ? (
          <ForecastSkeleton />
        ) : (
          <>
            <FadeContent delay={100}>
              <MarketSnapshotRow market={marketData} />
            </FadeContent>

            <FadeContent delay={140}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ForecastProbabilityCard
                  horizonLabel="Next trading day"
                  horizonHint="Direction of tomorrow's close vs today's close."
                  forecast={oneDay}
                />
                <ForecastProbabilityCard
                  horizonLabel="Next five sessions"
                  horizonHint="Direction of the close five sessions from now vs today's close."
                  forecast={fiveDay}
                />
              </div>
            </FadeContent>

            <FadeContent delay={180}>
              <PriceHistoryChart market={marketData} />
            </FadeContent>

            <FadeContent delay={220}>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <PredictionExplanation horizonLabel="1-day model" forecast={oneDay} />
                <PredictionExplanation horizonLabel="5-day model" forecast={fiveDay} />
              </div>
            </FadeContent>

            <FadeContent delay={260}>
              <ModelPerformancePanel metrics={metricsData} />
            </FadeContent>

            <FadeContent delay={300}>
              <BacktestSummary
                backtest={metricsData?.horizons?.['1d']?.backtest}
              />
            </FadeContent>

            <FadeContent delay={340}>
              <ForecastHistoryTable records={historyData?.records ?? []} />
            </FadeContent>

            <FadeContent delay={380}>
              <NewsContextPanel news={newsData} />
            </FadeContent>

            <FadeContent delay={420}>
              <MethodologyPanel metrics={metricsData} />
            </FadeContent>

            {shouldUseDemoFallback && backendUnavailable ? (
              <FadeContent delay={460}>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={disableDemo}
                    className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-xs text-slate-300 transition-colors hover:bg-white/[0.06]"
                  >
                    Turn off sample data
                  </button>
                </div>
              </FadeContent>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
