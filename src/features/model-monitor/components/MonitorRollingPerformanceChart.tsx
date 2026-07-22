import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'
import type { HoldoutBaselineSummary, RollingWindowPoint } from '../api/types'
import {
  formatCompactDate,
  formatMetricScore,
  formatPercentScore,
} from '../utils/format'

type RollingMetricKey = 'accuracy' | 'brier' | 'ece'

const METRIC_OPTIONS: { key: RollingMetricKey; label: string }[] = [
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'brier', label: 'Brier score' },
  { key: 'ece', label: 'Calibration error' },
]

interface MonitorRollingPerformanceChartProps {
  series: RollingWindowPoint[]
  baseline: HoldoutBaselineSummary | null
}

interface ChartRow {
  end_date: string
  start_date: string
  n_observations: number
  value: number | null
}

function baselineForMetric(
  baseline: HoldoutBaselineSummary | null,
  metric: RollingMetricKey,
): number | null {
  if (!baseline) return null
  if (metric === 'accuracy') return baseline.accuracy
  if (metric === 'brier') return baseline.brier
  return baseline.ece
}

function formatMetricValue(metric: RollingMetricKey, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (metric === 'accuracy') return formatPercentScore(value)
  return formatMetricScore(value, 3)
}

function RollingTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartRow }>
  metric: RollingMetricKey
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const metricLabel =
    METRIC_OPTIONS.find((option) => option.key === metric)?.label ?? metric
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[rgba(13,12,20,0.95)] px-3 py-2 text-xs text-slate-100 shadow-lg">
      <p className="font-medium text-white">
        {formatCompactDate(row.start_date)} – {formatCompactDate(row.end_date)}
      </p>
      <p className="mt-1 text-slate-300">
        {metricLabel}:{' '}
        <span className="text-[#00FFB2]">{formatMetricValue(metric, row.value)}</span>
      </p>
      <p className="mt-1 text-slate-500">{row.n_observations} observations</p>
    </div>
  )
}

export function MonitorRollingPerformanceChart({
  series,
  baseline,
}: MonitorRollingPerformanceChartProps) {
  const [metric, setMetric] = useState<RollingMetricKey>('accuracy')

  const chartData = useMemo<ChartRow[]>(() => {
    return series.map((point) => ({
      end_date: point.end_date,
      start_date: point.start_date,
      n_observations: point.n_observations,
      value:
        metric === 'accuracy'
          ? point.accuracy
          : metric === 'brier'
            ? point.brier
            : point.ece,
    }))
  }, [metric, series])

  const plotted = chartData.filter(
    (row) => row.value != null && Number.isFinite(row.value),
  )
  const baselineValue = baselineForMetric(baseline, metric)

  const yDomain = useMemo(() => {
    const values = plotted
      .map((row) => row.value as number)
      .concat(baselineValue != null && Number.isFinite(baselineValue) ? [baselineValue] : [])
    if (values.length === 0) return [0, 1] as [number, number]
    if (metric === 'accuracy') {
      const min = Math.min(...values, 0)
      const max = Math.max(...values, 1)
      const pad = Math.max((max - min) * 0.08, 0.02)
      return [Math.max(0, min - pad), Math.min(1, max + pad)] as [number, number]
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max((max - min) * 0.12, 0.01)
    return [Math.max(0, min - pad), max + pad] as [number, number]
  }, [baselineValue, metric, plotted])

  const summary = useMemo(() => {
    if (plotted.length === 0) {
      return `No ${metric} points are available for the selected rolling window.`
    }
    const last = plotted[plotted.length - 1]
    const baselineText =
      baselineValue == null
        ? 'No holdout baseline reference is available for this metric.'
        : `Holdout baseline is ${formatMetricValue(metric, baselineValue)}.`
    return `Rolling ${METRIC_OPTIONS.find((o) => o.key === metric)?.label.toLowerCase()} ends at ${formatMetricValue(metric, last.value)} on ${last.end_date} across ${last.n_observations} observations. ${baselineText}`
  }, [baselineValue, metric, plotted])

  return (
    <GlassCard className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/70">
            Rolling performance
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">Chronological series</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Out-of-sample metrics for each completed window, with the original holdout
            baseline as a dashed reference when available.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Rolling performance metric"
          className="flex flex-wrap gap-2"
        >
          {METRIC_OPTIONS.map((option) => {
            const selected = option.key === metric
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMetric(option.key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                  selected
                    ? 'border-[#00FFB2]/40 bg-[#00FFB2]/10 text-[#00FFB2]'
                    : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.06]',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <p className="sr-only" role="note">
        {summary}
      </p>

      {plotted.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          Not enough complete rolling windows to chart{' '}
          {METRIC_OPTIONS.find((option) => option.key === metric)?.label.toLowerCase()}.
        </p>
      ) : (
        <div className="mt-6 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 6"
                vertical={false}
              />
              <XAxis
                dataKey="end_date"
                stroke="rgba(255,255,255,0.35)"
                tick={{ fontSize: 11 }}
                minTickGap={28}
                tickFormatter={(value: string) => formatCompactDate(value)}
              />
              <YAxis
                domain={yDomain}
                stroke="rgba(255,255,255,0.35)"
                tick={{ fontSize: 11 }}
                width={48}
                tickFormatter={(value: number) =>
                  metric === 'accuracy'
                    ? `${Math.round(Number(value) * 100)}%`
                    : Number(value).toFixed(2)
                }
              />
              <Tooltip
                content={<RollingTooltip metric={metric} />}
                cursor={{ stroke: 'rgba(0,255,178,0.35)', strokeWidth: 1 }}
              />
              {baselineValue != null && Number.isFinite(baselineValue) ? (
                <ReferenceLine
                  y={baselineValue}
                  stroke="rgba(255,255,255,0.35)"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Baseline',
                    position: 'insideTopRight',
                    fill: 'rgba(148,163,184,0.9)',
                    fontSize: 11,
                  }}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#00FFB2"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                name={METRIC_OPTIONS.find((option) => option.key === metric)?.label}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}
