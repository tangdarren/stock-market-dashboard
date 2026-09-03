import type { Mode } from '../api/types'
import { formatDate, formatProbability } from './format'
import type { HorizonOutlook } from './interpretation'

const DISCLAIMER = 'Educational analysis only — not financial advice.'

/** User-facing labels for modes that must be disclosed in a copied summary. */
const DISCLOSED_MODE_LABELS: Partial<Record<Mode, string>> = {
  simulated: 'Simulated data',
  demo: 'Demo data',
  stale: 'Stale cache',
}

export interface ForecastOutlookSummaryInput {
  oneDay: HorizonOutlook | null
  fiveDay: HorizonOutlook | null
  sessionDate?: string | null
  effectiveMode?: Mode | null
}

/**
 * Build a concise clipboard summary from the same outlooks already shown in
 * the decision hero. Returns null when neither horizon has a useful forecast.
 */
export function buildForecastOutlookSummary(
  input: ForecastOutlookSummaryInput,
): string | null {
  const { oneDay, fiveDay, sessionDate, effectiveMode } = input
  if (!oneDay && !fiveDay) return null

  const header = ['SPY Market Outlook']
  if (sessionDate) {
    const formatted = formatDate(sessionDate)
    if (formatted !== '—') header.push(`Session: ${formatted}`)
  }

  const horizons = [
    formatHorizonField('1-day', 'outlook', oneDay?.headline),
    formatHorizonField(
      '1-day',
      'probability up',
      oneDay ? formatProbability(oneDay.probUp) : null,
    ),
    formatHorizonField('5-day', 'outlook', fiveDay?.headline),
    formatHorizonField(
      '5-day',
      'probability up',
      fiveDay ? formatProbability(fiveDay.probUp) : null,
    ),
  ]

  const footer: string[] = []
  const modeLabel = effectiveMode ? DISCLOSED_MODE_LABELS[effectiveMode] : undefined
  if (modeLabel) footer.push(`Data mode: ${modeLabel}`)
  footer.push(DISCLAIMER)

  return [...header, '', ...horizons, '', ...footer].join('\n')
}

function formatHorizonField(
  horizon: '1-day' | '5-day',
  field: 'outlook' | 'probability up',
  value: string | null | undefined,
): string {
  return `${horizon} ${field}: ${value ?? 'Unavailable'}`
}
