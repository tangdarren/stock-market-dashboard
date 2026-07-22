import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FadeContent } from '@/features/ui/components/FadeContent'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { MonitorBaselineComparison } from '@/features/model-monitor/components/MonitorBaselineComparison'
import { MonitorConfidenceReliability } from '@/features/model-monitor/components/MonitorConfidenceReliability'
import { MonitorControls } from '@/features/model-monitor/components/MonitorControls'
import { MonitorFeatureDriftList } from '@/features/model-monitor/components/MonitorFeatureDriftList'
import { MonitorHealthExplanation } from '@/features/model-monitor/components/MonitorHealthExplanation'
import { MonitorPerformanceSummary } from '@/features/model-monitor/components/MonitorPerformanceSummary'
import { MonitorRollingPerformanceChart } from '@/features/model-monitor/components/MonitorRollingPerformanceChart'
import { MonitorStatusCard } from '@/features/model-monitor/components/MonitorStatusCard'
import { MonitorStatusPanel } from '@/features/model-monitor/components/MonitorStatusPanel'
import { useModelMonitoring } from '@/features/model-monitor/hooks/useModelMonitoring'
import type { MonitoringHorizon, MonitoringWindow } from '@/features/model-monitor/api/types'
import {
  parseMonitoringHorizon,
  parseMonitoringWindow,
} from '@/features/model-monitor/utils/format'
import { BackendUnavailableError } from '@/lib/api/client'
import { usePageTitle } from '@/hooks/usePageTitle'

function writeMonitorParams(
  horizon: MonitoringHorizon,
  window: MonitoringWindow,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('horizon', horizon)
  params.set('window', String(window))
  return params
}

export function ModelMonitorPage() {
  usePageTitle('Model Monitor')

  const [searchParams, setSearchParams] = useSearchParams()
  const horizon = parseMonitoringHorizon(searchParams.get('horizon'))
  const windowSize = parseMonitoringWindow(searchParams.get('window'))

  const query = useModelMonitoring({ horizon, window: windowSize })
  const data = query.data
  const backendUnavailable = query.error instanceof BackendUnavailableError
  const isBusy = query.isLoading || query.isFetching
  const showLoading = isBusy && !data
  const unavailable = Boolean(data && !data.available)
  const showStatusPanel =
    showLoading ||
    backendUnavailable ||
    Boolean(query.error) ||
    unavailable

  const setHorizon = useCallback(
    (next: MonitoringHorizon) => {
      setSearchParams(writeMonitorParams(next, windowSize), { replace: true })
    },
    [setSearchParams, windowSize],
  )

  const setWindow = useCallback(
    (next: MonitoringWindow) => {
      setSearchParams(writeMonitorParams(horizon, next), { replace: true })
    },
    [horizon, setSearchParams],
  )

  const retry = useCallback(() => {
    void query.refetch()
  }, [query])

  const availableData = useMemo(
    () => (data?.available ? data : null),
    [data],
  )

  return (
    <div className="min-h-screen overflow-x-hidden pt-28 pb-24">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <FadeContent>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
            Model Health and Drift Center
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Model Monitor
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-400">
            Track rolling out-of-sample performance and feature drift for the SPY direction
            models. Choose a forecast horizon and session window to inspect the latest health
            summary against the original holdout baseline.
          </p>
        </FadeContent>

        <FadeContent className="mt-10">
          <GlassCard className="p-6 sm:p-8">
            <MonitorControls
              horizon={horizon}
              window={windowSize}
              onHorizonChange={setHorizon}
              onWindowChange={setWindow}
              disabled={showLoading}
            />
            <p className="mt-4 text-xs text-slate-500">
              Selection is stored in the URL as{' '}
              <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300">
                ?horizon={horizon}&window={windowSize}
              </code>{' '}
              so this view can be shared or refreshed without losing state.
            </p>
          </GlassCard>
        </FadeContent>

        {showStatusPanel ? (
          <FadeContent className="mt-6">
            <MonitorStatusPanel
              isLoading={showLoading}
              backendUnavailable={backendUnavailable}
              unavailableReason={data && !data.available ? data.reason : null}
              unavailableDetail={data && !data.available ? data.detail : null}
              errorMessage={
                query.error && !backendUnavailable ? query.error.message : null
              }
              onRetry={retry}
            />
          </FadeContent>
        ) : null}

        {availableData ? (
          <FadeContent className="mt-6 space-y-6">
            <MonitorStatusCard data={availableData} />
            {availableData.latest_performance ? (
              <MonitorPerformanceSummary latest={availableData.latest_performance} />
            ) : null}
            <MonitorBaselineComparison
              baseline={availableData.baseline}
              latest={availableData.latest_performance}
            />
            <MonitorRollingPerformanceChart
              series={availableData.rolling_series}
              baseline={availableData.baseline}
            />
            <MonitorConfidenceReliability
              confidence={availableData.confidence_vs_accuracy}
            />
            <MonitorFeatureDriftList featureDrift={availableData.feature_drift} />
            <MonitorHealthExplanation data={availableData} />
          </FadeContent>
        ) : null}
      </div>
    </div>
  )
}
