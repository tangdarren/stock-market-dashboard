import { Badge } from '@/components/common/Badge'
import type { ExplanationFactor, HorizonForecast } from '../api/types'
import { cn } from '@/lib/utils/cn'
import { formatFeature } from '../utils/format'

interface PredictionExplanationProps {
  horizonLabel: string
  forecast?: HorizonForecast | null
}

const methodCopy: Record<string, { label: string; hint: string }> = {
  logistic_regression_contribution: {
    label: 'Local standardized feature contributions',
    hint: 'For logistic regression: each factor is the standardized feature value multiplied by its learned coefficient.',
  },
  permutation_importance_x_context: {
    label: 'Global importance × current context',
    hint: 'For tree models: global permutation importance (measured during training) combined with whether the current feature value sits above or below its training median. Not a causal explanation.',
  },
}

export function PredictionExplanation({ horizonLabel, forecast }: PredictionExplanationProps) {
  if (!forecast) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {horizonLabel}
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Explanations unavailable — no trained model artifact for this horizon.
        </p>
      </div>
    )
  }

  const method = methodCopy[forecast.explanations.method] ?? {
    label: forecast.explanations.method,
    hint: '',
  }

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            {horizonLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">Method: {method.label}</p>
        </div>
        <Badge variant="neutral">Explainable</Badge>
      </div>

      {method.hint ? (
        <p className="mt-3 text-xs text-slate-500">{method.hint}</p>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
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
    </div>
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
  const iconTitle =
    tone === 'up'
      ? 'Factor supporting higher outcome'
      : tone === 'down'
        ? 'Factor supporting lower outcome'
        : 'Factor adding uncertainty'
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
      <h4 className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wide', toneClass)}>
        <FactorIcon tone={tone} title={iconTitle} />
        {heading}
      </h4>
      <ul className="mt-3 space-y-3">
        {factors.length === 0 ? (
          <li className="text-xs text-slate-500">{emptyLabel}</li>
        ) : (
          factors.map((factor) => <FactorRow key={factor.feature} factor={factor} />)
        )}
      </ul>
    </div>
  )
}

function FactorRow({ factor }: { factor: ExplanationFactor }) {
  const friendly = factor.plain_english?.trim() || formatFeature(factor.feature)
  return (
    <li className="space-y-1">
      <p className="text-sm text-slate-100">{friendly}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span className="font-mono text-slate-500">{factor.feature}</span>
        <span aria-hidden>·</span>
        <span>
          value{' '}
          <span className="font-mono text-slate-300">{formatValue(factor.value)}</span>
        </span>
        {Number.isFinite(factor.contribution) ? (
          <>
            <span aria-hidden>·</span>
            <span>
              contribution{' '}
              <span className="font-mono text-slate-300">
                {factor.contribution >= 0 ? '+' : ''}
                {factor.contribution.toFixed(3)}
              </span>
            </span>
          </>
        ) : null}
      </div>
    </li>
  )
}

function FactorIcon({
  tone,
  title,
}: {
  tone: 'up' | 'down' | 'uncertainty'
  title: string
}) {
  if (tone === 'up') {
    return (
      <svg
        role="img"
        aria-label={title}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M4 12l6-6 6 6" />
      </svg>
    )
  }
  if (tone === 'down') {
    return (
      <svg
        role="img"
        aria-label={title}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M4 8l6 6 6-6" />
      </svg>
    )
  }
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4M10 13.5v.5" />
    </svg>
  )
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 1) return v.toFixed(2)
  return v.toFixed(4)
}
