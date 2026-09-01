import { useMemo } from 'react'
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

import type { ForecastResponse, WalkForwardRecord } from '../api/types'
import { formatDate, formatProbability } from '../utils/format'
import {
  buildForecastProbabilityTimeline,
  hasEnoughTimelinePoints,
  type ForecastProbabilityPoint,
} from '../utils/forecastProbabilityTimeline'

const ONE_DAY_COLOR = '#00FFB2'
const FIVE_DAY_COLOR = '#7DD3FC'
const REFERENCE_COLOR = 'rgba(255,255,255,0.45)'

interface ForecastProbabilityTimelineProps {
  forecast?: ForecastResponse | null
  historyRecords?: readonly WalkForwardRecord[] | null
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ForecastProbabilityPoint }>
  label?: string
}

function ProbabilityTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[rgba(13,12,20,0.95)] px-3 py-2 text-xs text-slate-100 shadow-lg">
      <p className="font-medium text-white">{formatDate(row.date)}</p>
      <p className="mt-1.5 text-slate-300">
        1-day P(up):{' '}
        <span className="font-mono text-[#00FFB2]">
          {row.oneDay == null ? '—' : formatProbability(row.oneDay)}
        </span>
      </p>
      <p className="mt-1 text-slate-300">
        5-day P(up):{' '}
        <span className="font-mono text-[#7DD3FC]">
          {row.fiveDay == null ? '—' : formatProbability(row.fiveDay)}
        </span>
      </p>
    </div>
  )
}

export function ForecastProbabilityTimeline({
  forecast,
  historyRecords,
}: ForecastProbabilityTimelineProps) {
  const data = useMemo(
    () => buildForecastProbabilityTimeline(forecast, historyRecords),
    [forecast, historyRecords],
  )

  const yDomain = useMemo(() => {
    const values = data.points.flatMap((point) =>
      [point.oneDay, point.fiveDay].filter((value): value is number => value != null),
    )
    if (values.length === 0) return [0, 1] as [number, number]
    const min = Math.min(...values, 0.5)
    const max = Math.max(...values, 0.5)
    const pad = Math.max((max - min) * 0.15, 0.05)
    return [Math.max(0, min - pad), Math.min(1, max + pad)] as [number, number]
  }, [data.points])

  const summary = useMemo(() => {
    if (!hasEnoughTimelinePoints(data)) {
      return 'Not enough forecast history is available to chart recent 1-day and 5-day bullish probabilities.'
    }
    const last = data.points[data.points.length - 1]!
    const oneDay = last.oneDay == null ? 'unavailable' : formatProbability(last.oneDay)
    const fiveDay = last.fiveDay == null ? 'unavailable' : formatProbability(last.fiveDay)
    return `Recent forecast probability history across ${data.points.length} sessions, ending ${formatDate(last.date)}. Latest 1-day bullish probability ${oneDay}; latest 5-day bullish probability ${fiveDay}.`
  }, [data])

  return (
    <div
      className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
      data-testid="forecast-probability-timeline"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Forecast probability history
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Recent 1-day and 5-day bullish probabilities over time, including the
          current forecast as the latest point.
        </p>
      </div>

      <p className="sr-only" role="note">
        {summary}
      </p>

      {!hasEnoughTimelinePoints(data) ? (
        <p className="mt-3 text-sm text-slate-400">
          Not enough forecast history is available to chart recent 1-day and
          5-day bullish probabilities.
        </p>
      ) : (
        <>
          <ul
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400"
            aria-label="Forecast probability history legend"
          >
            {data.hasOneDay ? (
              <LegendItem color={ONE_DAY_COLOR} label="1-day P(up)" />
            ) : null}
            {data.hasFiveDay ? (
              <LegendItem color={FIVE_DAY_COLOR} label="5-day P(up)" />
            ) : null}
            <LegendItem color={REFERENCE_COLOR} label="50% reference" dashed />
          </ul>
          <div className="mt-3 h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 6"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11 }}
                  minTickGap={28}
                  tickFormatter={formatAxisDate}
                />
                <YAxis
                  domain={yDomain}
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ fontSize: 11 }}
                  width={44}
                  tickFormatter={(value: number) => `${Math.round(Number(value) * 100)}%`}
                />
                <Tooltip
                  content={<ProbabilityTooltip />}
                  cursor={{ stroke: 'rgba(0,255,178,0.35)', strokeWidth: 1 }}
                />
                <ReferenceLine
                  y={0.5}
                  stroke={REFERENCE_COLOR}
                  strokeDasharray="4 4"
                  label={{
                    value: '50%',
                    position: 'insideTopRight',
                    fill: 'rgba(148,163,184,0.9)',
                    fontSize: 11,
                  }}
                />
                {data.hasOneDay ? (
                  <Line
                    type="monotone"
                    dataKey="oneDay"
                    name="1-day P(up)"
                    stroke={ONE_DAY_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3, stroke: ONE_DAY_COLOR, fill: ONE_DAY_COLOR }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : null}
                {data.hasFiveDay ? (
                  <Line
                    type="monotone"
                    dataKey="fiveDay"
                    name="5-day P(up)"
                    stroke={FIVE_DAY_COLOR}
                    strokeWidth={2}
                    dot={{ r: 3, stroke: FIVE_DAY_COLOR, fill: FIVE_DAY_COLOR }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

function LegendItem({
  color,
  label,
  dashed = false,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <li className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="h-0.5 w-4 shrink-0"
        style={{
          background: dashed ? 'transparent' : color,
          borderTop: dashed ? `1.5px dashed ${color}` : undefined,
        }}
      />
      {label}
    </li>
  )
}

function formatAxisDate(value: string): string {
  const parts = value.split('-')
  if (parts.length < 3) return value
  return `${parts[1]}/${parts[2]}`
}
