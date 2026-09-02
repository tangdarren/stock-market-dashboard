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

import { cn } from '@/lib/utils/cn'
import type { ForecastResponse, MarketResponse, WalkForwardRecord } from '../api/types'
import { explainForecastShift } from '../utils/explainForecastShift'
import { formatDate, formatProbability } from '../utils/format'
import {
  buildForecastProbabilityTimeline,
  hasEnoughTimelinePoints,
  type ForecastProbabilityPoint,
} from '../utils/forecastProbabilityTimeline'
import {
  SIGNIFICANT_FORECAST_SHIFT_PP,
  describeForecastShift,
  detectForecastShifts,
  forecastShiftKey,
  indexForecastShifts,
  isDirectionalFlip,
  primaryForecastShiftKind,
  type ForecastShift,
  type ForecastShiftHorizon,
} from '../utils/forecastShifts'
import { ForecastShiftExplanation } from './ForecastShiftExplanation'

const ONE_DAY_COLOR = '#00FFB2'
const FIVE_DAY_COLOR = '#7DD3FC'
const REFERENCE_COLOR = 'rgba(255,255,255,0.45)'
const FLIP_COLOR = '#FBBF24'
const INCREASE_COLOR = '#00FFB2'
const DECREASE_COLOR = '#F87171'

interface ForecastProbabilityTimelineProps {
  forecast?: ForecastResponse | null
  historyRecords?: readonly WalkForwardRecord[] | null
  /** Market series used to explain indicator context around a selected shift. */
  market?: MarketResponse | null
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: ForecastProbabilityPoint }>
  label?: string
  shiftsByKey?: Map<string, ForecastShift>
}

function ProbabilityTooltip({ active, payload, shiftsByKey }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null

  const oneDayShift = shiftsByKey?.get(forecastShiftKey('oneDay', row.date))
  const fiveDayShift = shiftsByKey?.get(forecastShiftKey('fiveDay', row.date))

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[rgba(13,12,20,0.95)] px-3 py-2 text-xs text-slate-100 shadow-lg">
      <p className="font-medium text-white">{formatDate(row.date)}</p>
      <p className="mt-1.5 text-slate-300">
        1-day P(up):{' '}
        <span className="font-mono text-[#00FFB2]">
          {row.oneDay == null ? '—' : formatProbability(row.oneDay)}
        </span>
      </p>
      {oneDayShift ? (
        <p className="mt-0.5 text-[11px] text-amber-200">
          {describeForecastShift(oneDayShift)}
        </p>
      ) : null}
      <p className="mt-1 text-slate-300">
        5-day P(up):{' '}
        <span className="font-mono text-[#7DD3FC]">
          {row.fiveDay == null ? '—' : formatProbability(row.fiveDay)}
        </span>
      </p>
      {fiveDayShift ? (
        <p className="mt-0.5 text-[11px] text-amber-200">
          {describeForecastShift(fiveDayShift)}
        </p>
      ) : null}
    </div>
  )
}

export function ForecastProbabilityTimeline({
  forecast,
  historyRecords,
  market,
}: ForecastProbabilityTimelineProps) {
  const data = useMemo(
    () => buildForecastProbabilityTimeline(forecast, historyRecords),
    [forecast, historyRecords],
  )

  const shifts = useMemo(() => detectForecastShifts(data.points), [data.points])
  const shiftsByKey = useMemo(() => indexForecastShifts(shifts), [shifts])
  const selectableShifts = useMemo(
    () =>
      shifts
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || a.horizon.localeCompare(b.horizon)),
    [shifts],
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedShift = selectedKey ? (shiftsByKey.get(selectedKey) ?? null) : null
  const selectedExplanation = useMemo(
    () => (selectedShift ? explainForecastShift(selectedShift, market?.series) : null),
    [market?.series, selectedShift],
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
    const shiftSummary =
      shifts.length === 0
        ? 'No meaningful shifts in this window.'
        : `${shifts.length} meaningful ${shifts.length === 1 ? 'shift' : 'shifts'}: ${shifts.map(describeForecastShift).join('; ')}. Select a highlighted shift to inspect probabilities and market context.`
    return `Recent forecast probability history across ${data.points.length} sessions, ending ${formatDate(last.date)}. Latest 1-day bullish probability ${oneDay}; latest 5-day bullish probability ${fiveDay}. ${shiftSummary}`
  }, [data, shifts])

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
            {shifts.length > 0 ? (
              <LegendItem color={FLIP_COLOR} label="Meaningful shift" halo />
            ) : null}
          </ul>
          <div className="mt-3 h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.points}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const date =
                    typeof state?.activeLabel === 'string' ? state.activeLabel : null
                  if (!date) return
                  const match =
                    shiftsByKey.get(forecastShiftKey('oneDay', date)) ??
                    shiftsByKey.get(forecastShiftKey('fiveDay', date))
                  if (match) {
                    setSelectedKey(forecastShiftKey(match.horizon, match.date))
                  }
                }}
              >
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
                  content={<ProbabilityTooltip shiftsByKey={shiftsByKey} />}
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
                    dot={renderHorizonDot(shiftsByKey, 'oneDay', ONE_DAY_COLOR, false, selectedKey)}
                    activeDot={renderHorizonDot(shiftsByKey, 'oneDay', ONE_DAY_COLOR, true, selectedKey)}
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
                    dot={renderHorizonDot(shiftsByKey, 'fiveDay', FIVE_DAY_COLOR, false, selectedKey)}
                    activeDot={renderHorizonDot(shiftsByKey, 'fiveDay', FIVE_DAY_COLOR, true, selectedKey)}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {shifts.length > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Larger markers highlight directional flips across 50% or moves of
              at least {SIGNIFICANT_FORECAST_SHIFT_PP} percentage points. Ordinary
              day-to-day wiggles stay unmarked. Select a highlighted shift to
              inspect the probabilities and market context between those dates.
            </p>
          ) : null}

          {selectableShifts.length > 0 ? (
            <div
              role="radiogroup"
              aria-label="Meaningful forecast shifts"
              className="mt-3 max-h-40 space-y-1.5 overflow-y-auto pr-1"
            >
              {selectableShifts.map((shift) => {
                const key = forecastShiftKey(shift.horizon, shift.date)
                const selected = key === selectedKey
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                      selected
                        ? 'border-[#00FFB2]/40 bg-[#00FFB2]/10 text-[#00FFB2]'
                        : 'border-white/[0.08] bg-white/[0.02] text-slate-300 hover:bg-white/[0.06]',
                    )}
                  >
                    <span className="block font-medium">{describeForecastShift(shift)}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                      {shift.previousDate} → {shift.date}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}

          {selectedExplanation ? (
            <ForecastShiftExplanation explanation={selectedExplanation} />
          ) : selectableShifts.length > 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Select a highlighted shift to inspect previous and current
              probabilities, the percentage-point change, and the largest market
              indicator changes between those sessions.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

function renderHorizonDot(
  shiftsByKey: Map<string, ForecastShift>,
  horizon: ForecastShiftHorizon,
  seriesColor: string,
  active = false,
  selectedKey: string | null = null,
) {
  return function HorizonDot({
    cx,
    cy,
    payload,
    value,
  }: {
    cx?: number
    cy?: number
    payload?: ForecastProbabilityPoint
    value?: number | null
  }) {
    const key = payload ? forecastShiftKey(horizon, payload.date) : null
    const shift = key ? shiftsByKey.get(key) : undefined
    return (
      <ShiftAwareDot
        cx={cx}
        cy={cy}
        value={value}
        shift={shift}
        seriesColor={seriesColor}
        active={active}
        selected={Boolean(key && key === selectedKey)}
      />
    )
  }
}

function ShiftAwareDot({
  cx,
  cy,
  value,
  shift,
  seriesColor,
  active = false,
  selected = false,
}: {
  cx?: number
  cy?: number
  value?: number | null
  shift?: ForecastShift
  seriesColor: string
  active?: boolean
  selected?: boolean
}) {
  if (cx == null || cy == null || value == null || !Number.isFinite(value)) {
    return null
  }

  if (!shift) {
    const radius = active ? 4.5 : 3
    return <circle cx={cx} cy={cy} r={radius} fill={seriesColor} stroke={seriesColor} />
  }

  const color = colorForShift(shift)
  const halo = selected || active ? 10 : 8
  const core = selected || active ? 6 : 5

  return (
    <g>
      {selected ? (
        <circle
          cx={cx}
          cy={cy}
          r={halo + 2}
          fill="none"
          stroke="#00FFB2"
          strokeWidth={1.2}
        />
      ) : null}
      <circle cx={cx} cy={cy} r={halo} fill={color} fillOpacity={0.2} />
      {isDirectionalFlip(shift.kinds) ? (
        <rect
          x={cx - core * 0.72}
          y={cy - core * 0.72}
          width={core * 1.44}
          height={core * 1.44}
          fill={color}
          stroke="rgba(13,12,20,0.9)"
          strokeWidth={1.4}
          transform={`rotate(45 ${cx} ${cy})`}
        />
      ) : (
        <circle
          cx={cx}
          cy={cy}
          r={core}
          fill={color}
          stroke="rgba(13,12,20,0.9)"
          strokeWidth={1.4}
        />
      )}
    </g>
  )
}

function colorForShift(shift: ForecastShift): string {
  switch (primaryForecastShiftKind(shift.kinds)) {
    case 'flip_to_bullish':
    case 'flip_to_bearish':
      return FLIP_COLOR
    case 'significant_increase':
      return INCREASE_COLOR
    case 'significant_decrease':
      return DECREASE_COLOR
    default:
      return FLIP_COLOR
  }
}

function LegendItem({
  color,
  label,
  dashed = false,
  halo = false,
}: {
  color: string
  label: string
  dashed?: boolean
  halo?: boolean
}) {
  return (
    <li className="inline-flex items-center gap-2">
      {halo ? (
        <span className="relative inline-flex h-3 w-3 items-center justify-center" aria-hidden>
          <span
            className="absolute h-3 w-3 rounded-full opacity-30"
            style={{ background: color }}
          />
          <span className="relative h-1.5 w-1.5 rotate-45" style={{ background: color }} />
        </span>
      ) : (
        <span
          aria-hidden
          className="h-0.5 w-4 shrink-0"
          style={{
            background: dashed ? 'transparent' : color,
            borderTop: dashed ? `1.5px dashed ${color}` : undefined,
          }}
        />
      )}
      {label}
    </li>
  )
}

function formatAxisDate(value: string): string {
  const parts = value.split('-')
  if (parts.length < 3) return value
  return `${parts[1]}/${parts[2]}`
}
