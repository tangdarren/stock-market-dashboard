import { cn } from '@/lib/utils/cn'
import {
  FORECAST_OUTCOME_DISCLAIMER,
  describeForecastOutcome,
  formatRealizedReturn,
  type ForecastHorizonOutcome,
} from '../utils/forecastOutcomes'

interface ForecastOutcomeDetailsProps {
  outcome: ForecastHorizonOutcome | null | undefined
  compact?: boolean
  showDisclaimer?: boolean
  label?: string
}

export function ForecastOutcomeDetails({
  outcome,
  compact = false,
  showDisclaimer = false,
  label,
}: ForecastOutcomeDetailsProps) {
  if (!outcome) return null

  const statusLabel = describeForecastOutcome(outcome)
  const scored = outcome.status !== 'unavailable' && !outcome.isCurrent

  return (
    <div
      className={cn(compact ? 'mt-0.5 text-[11px] text-slate-400' : 'space-y-1')}
      data-testid="forecast-outcome-details"
    >
      {label ? (
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      ) : null}
      <p className={cn(compact ? 'text-[11px] text-slate-400' : 'text-sm text-slate-300')}>
        {statusLabel}
        {scored ? (
          <>
            {' · '}
            realized{' '}
            <span className="font-mono">{formatRealizedReturn(outcome.realizedReturn)}</span>
          </>
        ) : null}
      </p>
      {showDisclaimer ? (
        <p className="text-[11px] leading-relaxed text-slate-500">{FORECAST_OUTCOME_DISCLAIMER}</p>
      ) : null}
    </div>
  )
}
