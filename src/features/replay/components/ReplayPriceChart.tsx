import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Dot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlassCard } from '@/features/ui/components/GlassCard'
import { formatDate, formatPrice } from '@/features/forecast/utils/format'
import type { ReplayChartBar } from '../api/types'

interface ReplayPriceChartProps {
  series: ReplayChartBar[]
  selectedDate: string
}

interface ChartPoint {
  date: string
  close: number
  isSelected: boolean
}

export function ReplayPriceChart({ series, selectedDate }: ReplayPriceChartProps) {
  const chartData = useMemo<ChartPoint[]>(() => {
    // Defensive: never plot sessions after the selected date.
    return series
      .filter((row) => row.date <= selectedDate)
      .map((row) => ({
        date: row.date,
        close: Number(row.close),
        isSelected: row.date === selectedDate,
      }))
  }, [series, selectedDate])

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return undefined
    const values = chartData.map((r) => r.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min) * 0.05 || 1
    return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number]
  }, [chartData])

  const summary = useMemo(() => {
    if (chartData.length === 0) {
      return 'No historical closing-price series is available for this replay session.'
    }
    const first = chartData[0]
    const last = chartData[chartData.length - 1]
    const changePct = ((last.close - first.close) / first.close) * 100
    return (
      `SPY closing prices for ${chartData.length} completed sessions from ${first.date} ` +
      `through ${last.date}. Selected session close $${formatPrice(last.close)} on ${last.date}, ` +
      `${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(2)}% over the window. ` +
      `No sessions after ${selectedDate} are shown.`
    )
  }, [chartData, selectedDate])

  if (chartData.length === 0) {
    return (
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white">Historical closing price</h2>
        <p className="mt-2 text-sm text-slate-400">
          No chart points are available for this session.
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="overflow-hidden p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">Historical closing price</h2>
          <p className="mt-1 text-xs text-slate-500">
            {chartData.length} completed sessions through {selectedDate}. Future sessions are
            never shown.
          </p>
        </div>
      </div>

      <p className="sr-only" role="note">
        {summary}
      </p>

      <div className="h-64 w-full min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="replayPriceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00FFB2" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#00FFB2" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 11 }}
              minTickGap={28}
              tickFormatter={(v: string) => {
                const parts = v.split('-')
                return `${parts[1]}/${parts[2]}`
              }}
            />
            <YAxis
              domain={yDomain}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 11 }}
              width={48}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(0,255,178,0.35)', strokeWidth: 1 }}
              contentStyle={{
                background: 'rgba(13,12,20,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                color: '#f8fafc',
                fontSize: 12,
              }}
              labelFormatter={(label: string) => formatDate(label)}
              formatter={(value: number | string, _name: string, item) => {
                const point = item?.payload as ChartPoint | undefined
                const prefix = point?.isSelected ? 'Selected close' : 'Close'
                return [`$${formatPrice(Number(value))}`, prefix]
              }}
            />
            <ReferenceLine
              x={selectedDate}
              stroke="#00FFB2"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke="#00FFB2"
              strokeWidth={2}
              fill="url(#replayPriceGradient)"
              isAnimationActive={false}
              dot={(props) => {
                const { cx, cy, payload } = props
                if (!payload?.isSelected || cx == null || cy == null) {
                  return <g key={`dot-${payload?.date ?? 'x'}`} />
                }
                return (
                  <Dot
                    key={`selected-${payload.date}`}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill="#00FFB2"
                    stroke="#0d0c14"
                    strokeWidth={2}
                  />
                )
              }}
              activeDot={{ r: 4, fill: '#00FFB2', stroke: '#0d0c14', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
