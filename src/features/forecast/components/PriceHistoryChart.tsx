import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { GlassCard } from '@/features/ui/components/GlassCard'
import type { MarketResponse } from '../api/types'
import { formatPrice } from '../utils/format'

interface PriceHistoryChartProps {
  market?: MarketResponse
}

export function PriceHistoryChart({ market }: PriceHistoryChartProps) {
  const series = market?.series
  const chartData = useMemo(() => {
    if (!series) return []
    return series.map((row) => ({
      date: row.date,
      close: Number(row.close),
    }))
  }, [series])

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return undefined
    const values = chartData.map((r) => r.close)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min) * 0.05 || 1
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData])

  const summary = useMemo(() => {
    if (chartData.length === 0) return 'No price series available.'
    const first = chartData[0]
    const last = chartData[chartData.length - 1]
    const changePct = ((last.close - first.close) / first.close) * 100
    return `SPY closed at ${formatPrice(last.close)} on ${last.date}, ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(2)}% over the last ${chartData.length} sessions since ${first.date}.`
  }, [chartData])

  return (
    <GlassCard className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Recent SPY closing price</h2>
          <p className="text-xs text-slate-500">
            {chartData.length > 0
              ? `${chartData.length} completed sessions`
              : 'Awaiting data'}
          </p>
        </div>
      </div>

      <p className="sr-only" role="note">
        {summary}
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00FFB2" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#00FFB2" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 11 }}
              minTickGap={30}
              tickFormatter={(v: string) => {
                const parts = v.split('-')
                return `${parts[1]}/${parts[2]}`
              }}
            />
            <YAxis
              domain={yDomain}
              stroke="rgba(255,255,255,0.35)"
              tick={{ fontSize: 11 }}
              width={52}
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
              labelFormatter={(l: string) => `Date: ${l}`}
              formatter={(v: number | string) => [
                `$${formatPrice(Number(v))}`,
                'Close',
              ]}
            />
            {chartData.length > 0 ? (
              <ReferenceLine
                x={chartData[chartData.length - 1].date}
                stroke="#00FFB2"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="close"
              stroke="#00FFB2"
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
