import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { HorizonForecast } from '../api/types'
import { formatProbability } from '../utils/format'
import { DirectionIcon } from './DirectionIcon'
import { ProbabilityBar } from './ProbabilityBar'

interface ForecastProbabilityCardProps {
  horizonLabel: string
  horizonHint: string
  forecast?: HorizonForecast | null
}

const confidenceCopy = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
}

const confidenceVariant: Record<'low' | 'moderate' | 'high', 'neutral' | 'info' | 'success'> = {
  low: 'neutral',
  moderate: 'info',
  high: 'success',
}

export function ForecastProbabilityCard({
  horizonLabel,
  horizonHint,
  forecast,
}: ForecastProbabilityCardProps) {
  if (!forecast) {
    return (
      <GlassCard className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {horizonLabel}
        </p>
        <p className="mt-6 text-sm text-slate-400">
          Prediction unavailable. Train the models via{' '}
          <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300">
            python server/scripts/train_models.py
          </code>
          .
        </p>
      </GlassCard>
    )
  }

  const directionCopy = forecast.direction === 'up' ? 'Higher' : 'Lower'
  return (
    <GlassCard className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {horizonLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">{horizonHint}</p>
        </div>
        <Badge variant={confidenceVariant[forecast.confidence]}>
          Confidence: {confidenceCopy[forecast.confidence]}
        </Badge>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <DirectionIcon direction={forecast.direction} size="lg" />
        <div>
          <p className="text-3xl font-bold text-white">
            {formatProbability(forecast.prob_up)} up
          </p>
          <p className="text-sm text-slate-400">
            Model leans <span className="font-semibold text-slate-200">{directionCopy}</span>{' '}
            over the next {forecast.horizon_days === 1 ? 'session' : `${forecast.horizon_days} sessions`}
          </p>
        </div>
      </div>

      <ProbabilityBar probUp={forecast.prob_up} className="mt-5" label={`${horizonLabel} probability`} />

      <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/[0.03] p-3">
          <dt className="text-slate-500">Model</dt>
          <dd className="mt-1 font-mono text-slate-200">{forecast.model_name}</dd>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-3">
          <dt className="text-slate-500">Down probability</dt>
          <dd className="mt-1 font-semibold text-red-300">
            {formatProbability(forecast.prob_down)}
          </dd>
        </div>
      </dl>
    </GlassCard>
  )
}
