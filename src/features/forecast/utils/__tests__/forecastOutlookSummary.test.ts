import { demoForecast } from '../../demo/demoResponses'
import { formatDate, formatProbability } from '../format'
import { buildForecastOutlookSummary } from '../forecastOutlookSummary'
import { computeHorizonOutlook } from '../interpretation'

const oneDay = computeHorizonOutlook(demoForecast.one_day)
const fiveDay = computeHorizonOutlook(demoForecast.five_day)

describe('buildForecastOutlookSummary', () => {
  it('formats a concise 1-day and 5-day outlook from the displayed values', () => {
    const text = buildForecastOutlookSummary({
      oneDay,
      fiveDay,
      sessionDate: demoForecast.features_as_of,
      effectiveMode: 'live',
    })

    expect(text).toContain('SPY Market Outlook')
    expect(text).toContain(`Session: ${formatDate(demoForecast.features_as_of)}`)
    expect(text).toContain(`1-day outlook: ${oneDay!.headline}`)
    expect(text).toContain(
      `1-day probability up: ${formatProbability(oneDay!.probUp)}`,
    )
    expect(text).toContain(`5-day outlook: ${fiveDay!.headline}`)
    expect(text).toContain(
      `5-day probability up: ${formatProbability(fiveDay!.probUp)}`,
    )
    expect(text).toContain('Educational analysis only — not financial advice.')
    expect(text).not.toMatch(/data mode/i)
  })

  it('labels an unavailable horizon without dropping the other', () => {
    const text = buildForecastOutlookSummary({
      oneDay,
      fiveDay: null,
      sessionDate: demoForecast.features_as_of,
      effectiveMode: 'live',
    })

    expect(text).toContain(`1-day outlook: ${oneDay!.headline}`)
    expect(text).toContain(
      `1-day probability up: ${formatProbability(oneDay!.probUp)}`,
    )
    expect(text).toContain('5-day outlook: Unavailable')
    expect(text).toContain('5-day probability up: Unavailable')
  })

  it('includes simulated, demo, and stale data-mode labels', () => {
    const base = {
      oneDay,
      fiveDay,
      sessionDate: demoForecast.features_as_of,
    }

    expect(
      buildForecastOutlookSummary({ ...base, effectiveMode: 'simulated' }),
    ).toContain('Data mode: Simulated data')
    expect(
      buildForecastOutlookSummary({ ...base, effectiveMode: 'demo' }),
    ).toContain('Data mode: Demo data')
    expect(
      buildForecastOutlookSummary({ ...base, effectiveMode: 'stale' }),
    ).toContain('Data mode: Stale cache')
  })

  it('returns null when neither horizon has a useful forecast', () => {
    expect(
      buildForecastOutlookSummary({
        oneDay: null,
        fiveDay: null,
        sessionDate: demoForecast.features_as_of,
        effectiveMode: 'live',
      }),
    ).toBeNull()
  })
})
