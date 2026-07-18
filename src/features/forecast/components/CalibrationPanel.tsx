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

import type { CalibrationPoint } from '../api/types'

interface CalibrationPanelProps {
  points: CalibrationPoint[]
}

export function CalibrationPanel({ points }: CalibrationPanelProps) {
  if (!points || points.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Not enough holdout observations for a calibration curve.
      </p>
    )
  }
  const data = points.map((p) => ({
    predicted: Number(p.predicted_prob),
    empirical: Number(p.empirical_prob),
    n: p.n,
  }))
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 6" />
          <XAxis
            dataKey="predicted"
            type="number"
            domain={[0, 1]}
            stroke="rgba(255,255,255,0.35)"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          />
          <YAxis
            type="number"
            domain={[0, 1]}
            stroke="rgba(255,255,255,0.35)"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(13,12,20,0.95)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              color: '#f8fafc',
              fontSize: 12,
            }}
            formatter={(v: number, name: string) => [`${(Number(v) * 100).toFixed(1)}%`, name === 'empirical' ? 'Actual' : 'Predicted']}
            labelFormatter={(l: number) => `Predicted prob: ${(Number(l) * 100).toFixed(1)}%`}
          />
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="empirical"
            stroke="#00FFB2"
            strokeWidth={2}
            dot={{ r: 3, stroke: '#00FFB2', fill: '#00FFB2' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
