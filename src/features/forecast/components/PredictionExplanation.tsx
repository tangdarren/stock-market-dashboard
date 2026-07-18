import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { ExplanationFactor, HorizonForecast } from '../api/types'
import { formatFeature } from '../utils/format'

interface PredictionExplanationProps {
  horizonLabel: string
  forecast?: HorizonForecast | null
}

const methodCopy: Record<string, { label: string; hint: string }> = {
  logistic_regression_contribution: {
    label: 'Standardized coefficient contribution',
    hint: 'For logistic regression: standardized feature value times its learned coefficient.',
  },
  permutation_importance_x_context: {
    label: 'Global importance x current context',
    hint: 'For tree models: global permutation importance (from training) combined with whether the current feature is above or below its training median. Not a causal explanation.',
  },
}

export function PredictionExplanation({ horizonLabel, forecast }: PredictionExplanationProps) {
  if (!forecast) {
    return (
      <GlassCard className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {horizonLabel} · Explanation
        </p>
        <p className="mt-6 text-sm text-slate-400">
          Explanations unavailable — no trained model artifact.
        </p>
      </GlassCard>
    )
  }

  const method = methodCopy[forecast.explanations.method] ?? {
    label: forecast.explanations.method,
    hint: '',
  }

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {horizonLabel} · Why the model leans this way
          </p>
          <p className="mt-1 text-xs text-slate-500">Methodology: {method.label}</p>
        </div>
        <Badge variant="neutral">Explainable</Badge>
      </div>

      {method.hint ? (
        <p className="mt-3 text-xs text-slate-500">{method.hint}</p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FactorColumn
          heading="Supports higher"
          tone="up"
          factors={forecast.explanations.up}
          emptyLabel="No strong upward factors."
        />
        <FactorColumn
          heading="Supports lower"
          tone="down"
          factors={forecast.explanations.down}
          emptyLabel="No strong downward factors."
        />
        <FactorColumn
          heading="Adds uncertainty"
          tone="uncertainty"
          factors={forecast.explanations.uncertainty}
          emptyLabel="No specific uncertainty flags."
        />
      </div>
    </GlassCard>
  )
}

interface FactorColumnProps {
  heading: string
  tone: 'up' | 'down' | 'uncertainty'
  factors: ExplanationFactor[]
  emptyLabel: string
}

function FactorColumn({ heading, tone, factors, emptyLabel }: FactorColumnProps) {
  const toneClass =
    tone === 'up'
      ? 'text-[#00FFB2]'
      : tone === 'down'
        ? 'text-red-400'
        : 'text-slate-400'
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${toneClass}`}>
        {heading}
      </h3>
      <ul className="mt-3 space-y-3">
        {factors.length === 0 ? (
          <li className="text-xs text-slate-500">{emptyLabel}</li>
        ) : (
          factors.map((factor) => (
            <li key={factor.feature} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-100">
                  {formatFeature(factor.feature)}
                </span>
                <span className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-300">
                  {formatValue(factor.value)}
                </span>
              </div>
              <p className="text-xs text-slate-400">{factor.plain_english}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(2)
  return v.toFixed(4)
}
