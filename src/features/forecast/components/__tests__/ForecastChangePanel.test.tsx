import { render, screen } from '@testing-library/react'
import { ForecastChangePanel } from '../ForecastChangePanel'
import { demoForecast, demoHistory } from '../../demo/demoResponses'
import type { ForecastResponse, WalkForwardRecord } from '../../api/types'
import { BackendUnavailableError } from '@/lib/api/client'

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

describe('ForecastChangePanel', () => {
  it('renders previous, current, percentage-point change, and confidence for 1-day', () => {
    render(
      <ForecastChangePanel
        forecast={demoForecast}
        historyRecords={demoHistory.records}
        isDemo
      />,
    )

    expect(screen.getByText(/versus previous forecast/i)).toBeInTheDocument()
    expect(screen.getByText(/demo data — sample comparison/i)).toBeInTheDocument()

    expect(screen.getByText('44.0%')).toBeInTheDocument()
    expect(screen.getByText('58.0%')).toBeInTheDocument()
    expect(screen.getByText('+14.0 pp')).toBeInTheDocument()
    expect(screen.getByText('Confidence increased')).toBeInTheDocument()

    // Demo history has no prior 5-day row.
    expect(
      screen.getByText(/no earlier 5-day forecast was found/i),
    ).toBeInTheDocument()

    expect(
      screen.getByText(/not a prediction that the market will move/i),
    ).toBeInTheDocument()
  })

  it('renders both horizons when prior history exists for each', () => {
    const history = [
      mkRecord('2024-09-13', 1, 0.4),
      mkRecord('2024-09-13', 5, 0.61),
      mkRecord('2024-09-16', 1, 0.58),
      mkRecord('2024-09-16', 5, 0.54),
    ]
    render(
      <ForecastChangePanel forecast={demoForecast} historyRecords={history} />,
    )

    expect(screen.getByText('+18.0 pp')).toBeInTheDocument()
    expect(screen.getByText('-7.0 pp')).toBeInTheDocument()
    expect(screen.getAllByText('Confidence decreased').length).toBeGreaterThan(0)
  })

  it('shows a loading state while forecast data is pending', () => {
    render(<ForecastChangePanel isLoading />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/loading forecast change comparison/i)).toBeInTheDocument()
  })

  it('shows a missing-history state when no prior rows can be compared', () => {
    render(
      <ForecastChangePanel
        forecast={demoForecast}
        historyRecords={[mkRecord('2024-09-16', 1, 0.58)]}
      />,
    )
    expect(
      screen.getByText(/previous forecast history unavailable/i),
    ).toBeInTheDocument()
  })

  it('shows an unavailable state when the model is missing', () => {
    const unavailable: ForecastResponse = {
      ...demoForecast,
      model_unavailable: true,
      one_day: null,
      five_day: null,
    }
    render(
      <ForecastChangePanel
        forecast={unavailable}
        historyRecords={demoHistory.records}
        modelUnavailable
      />,
    )
    expect(screen.getByText(/forecast change unavailable/i)).toBeInTheDocument()
    expect(
      screen.getByText(/no trained model forecast is available/i),
    ).toBeInTheDocument()
  })

  it('shows an error state when history fails to load', () => {
    render(
      <ForecastChangePanel
        error={new BackendUnavailableError('offline')}
        historyRecords={null}
      />,
    )
    expect(screen.getByText(/forecast change unavailable/i)).toBeInTheDocument()
    expect(
      screen.getByText(/backend cannot be reached/i),
    ).toBeInTheDocument()
  })

  it('labels simulated comparisons without implying market direction', () => {
    render(
      <ForecastChangePanel
        forecast={{ ...demoForecast, mode: 'simulated' }}
        historyRecords={demoHistory.records}
        isSimulated
      />,
    )
    expect(
      screen.getByText(/simulated comparison — fictional scenario/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/will go up/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/buy/i)).not.toBeInTheDocument()
  })
})
