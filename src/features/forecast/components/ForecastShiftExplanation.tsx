import { Badge } from '@/components/common/Badge'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatProbability } from '../utils/format'
import { MARKET_CONTEXT_DISCLAIMER } from '../utils/marketIndicators'
import type { ForecastShiftExplanation as ForecastShiftExplanationData } from '../utils/explainForecastShift'
import type { ForecastHorizonOutcome } from '../utils/forecastOutcomes'
import { FORECAST_OUTCOME_DISCLAIMER } from '../utils/forecastOutcomes'
import { describeForecastShift, formatShiftChangePp } from '../utils/forecastShifts'
import { ForecastOutcomeDetails } from './ForecastOutcomeDetails'

interface ForecastShiftExplanationProps {
  explanation: ForecastShiftExplanationData
  previousOutcome?: ForecastHorizonOutcome | null
  currentOutcome?: ForecastHorizonOutcome | null
}

export function ForecastShiftExplanation({
  explanation,
  previousOutcome = null,
  currentOutcome = null,
}: ForecastShiftExplanationProps) {
  const { shift, changes, hasMarketSeries, canCompute, previousDate, currentDate } =
    explanation
  const changeTone =
    explanation.changePp > 0.05 ? 'up' : explanation.changePp < -0.05 ? 'down' : 'flat'
  const contextDate = explanation.currentIndicatorsAsOf ?? currentDate
  const previousContextDate = explanation.previousIndicatorsAsOf ?? previousDate

  return (
    <div
      className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
      data-testid="forecast-shift-explanation"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Selected forecast shift
          </p>
          <p className="mt-1 text-sm text-slate-200">{describeForecastShift(shift)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Forecast dates{' '}
            <span className="font-mono text-slate-400">{formatDate(previousDate)}</span>
            {' → '}
            <span className="font-mono text-slate-400">{formatDate(currentDate)}</span>
          </p>
        </div>
        <Badge variant="info">Context, not causation</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Stat
          label="Previous P(up)"
          value={formatProbability(explanation.previousProbUp)}
          hint={formatDate(previousDate)}
        />
        <Stat
          label="Current P(up)"
          value={formatProbability(explanation.currentProbUp)}
          hint={formatDate(currentDate)}
        />
        <Stat
          label="Change"
          value={formatShiftChangePp(explanation.changePp)}
          valueClassName={
            changeTone === 'up'
              ? 'text-[#00FFB2]'
              : changeTone === 'down'
                ? 'text-red-400'
                : 'text-slate-200'
          }
        />
      </dl>

      {previousOutcome || currentOutcome ? (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Scored outcomes
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ForecastOutcomeDetails
              label="Previous forecast"
              outcome={previousOutcome}
            />
            <ForecastOutcomeDetails
              label="Later forecast"
              outcome={currentOutcome}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {FORECAST_OUTCOME_DISCLAIMER}
          </p>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Market context between sessions
        </p>
        {previousContextDate && contextDate ? (
          <p className="mt-1 text-xs text-slate-500">
            Largest indicator changes from{' '}
            <span className="font-mono text-slate-400">{formatDate(previousContextDate)}</span>
            {' → '}
            <span className="font-mono text-slate-400">{formatDate(contextDate)}</span>
          </p>
        ) : null}

        {!hasMarketSeries ? (
          <p className="mt-3 text-sm text-slate-400">
            Market series data is not available, so indicator shifts between these
            two forecast sessions cannot be shown.
          </p>
        ) : !canCompute ? (
          <p className="mt-3 text-sm text-slate-400">
            Not enough overlapping market history was available to compare
            indicators between these two forecast dates.
          </p>
        ) : changes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No large shifts in RSI, volatility, returns, distance from the 20-day
            average, or relative volume stood out between these sessions.
          </p>
        ) : (
          <ul
            className="mt-3 space-y-2"
            aria-label="Largest market condition changes for selected forecast shift"
          >
            {changes.map((change) => (
              <li key={change.key} className="flex items-start gap-2 text-sm text-slate-200">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00FFB2]/70"
                />
                <span>{change.sentence}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {MARKET_CONTEXT_DISCLAIMER}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className={cn('mt-1 font-mono text-sm font-semibold text-slate-100', valueClassName)}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p> : null}
    </div>
  )
}
