import { render, screen } from '@testing-library/react'
import { ForecastProbabilityTimeline } from '../ForecastProbabilityTimeline'
import { demoForecast, demoHistory } from '../../demo/demoResponses'
import type { WalkForwardRecord } from '../../api/types'

function mkRecord(
  date: string,
  horizonDays: number,
  probUp: number,
): WalkForwardRecord {
  return {
    date,
    horizon_days: horizonDays,
    prob_up: probUp,
    predicted: probUp >= 0.5 ? 1 : 0,
    actual: 1,
    correct: 1,
    realized_return: 0.001,
  }
}

describe('ForecastProbabilityTimeline', () => {
  it('renders the history heading, legend, and an accessible summary for demo data', () => {
    render(
      <ForecastProbabilityTimeline
        forecast={demoForecast}
        historyRecords={demoHistory.records}
      />,
    )

    const timeline = screen.getByTestId('forecast-probability-timeline')
    expect(timeline).toBeInTheDocument()
    expect(
      screen.getByText('Forecast probability history'),
    ).toBeInTheDocument()
    const legend = screen.getByRole('list', {
      name: /forecast probability history legend/i,
    })
    expect(legend).toHaveTextContent(/1-day P\(up\)/i)
    expect(legend).toHaveTextContent(/5-day P\(up\)/i)
    expect(legend).toHaveTextContent(/50% reference/i)

    const summary = screen.getByRole('note')
    expect(summary.textContent).toMatch(/recent forecast probability history/i)
    expect(summary.textContent).toMatch(/58\.0%/)
    expect(summary.textContent).toMatch(/54\.0%/)
  })

  it('explains when history is missing or too short to chart', () => {
    render(
      <ForecastProbabilityTimeline
        forecast={demoForecast}
        historyRecords={[mkRecord('2024-09-16', 1, 0.58)]}
      />,
    )

    expect(
      screen.getAllByText(/not enough forecast history is available to chart/i)
        .length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/1-day P\(up\)/i)).not.toBeInTheDocument()
  })
})
