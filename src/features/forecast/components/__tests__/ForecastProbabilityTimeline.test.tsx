import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForecastProbabilityTimeline } from '../ForecastProbabilityTimeline'
import { demoForecast, demoHistory, demoMarket } from '../../demo/demoResponses'
import type { ForecastResponse, WalkForwardRecord } from '../../api/types'

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
    expect(legend).toHaveTextContent(/meaningful shift/i)

    const summary = screen.getByRole('note')
    expect(summary.textContent).toMatch(/recent forecast probability history/i)
    expect(summary.textContent).toMatch(/58\.0%/)
    expect(summary.textContent).toMatch(/54\.0%/)
    expect(summary.textContent).toMatch(/meaningful shifts/i)
    expect(summary.textContent).toMatch(/flipped bullish across 50%/i)

    const evolution = screen.getByTestId('forecast-evolution-summary')
    expect(evolution).toHaveTextContent(/forecast evolution/i)
    expect(evolution).toHaveTextContent(/recent directional reversal/i)
    expect(evolution).toHaveTextContent(/not a prediction that the market will reverse/i)
    expect(
      evolution.compareDocumentPosition(
        screen.getByRole('list', { name: /forecast probability history legend/i }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(
      screen.getByText(/larger markers highlight directional flips/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('radiogroup', { name: /meaningful forecast shifts/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/select a highlighted shift to inspect previous and current/i),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('forecast-shift-explanation')).not.toBeInTheDocument()
  })

  it('explains a selected shift with probabilities, dates, and market context', async () => {
    const user = userEvent.setup()
    render(
      <ForecastProbabilityTimeline
        forecast={demoForecast}
        historyRecords={demoHistory.records}
        market={demoMarket}
      />,
    )

    await user.click(
      screen.getByRole('radio', {
        name: /1-day flipped bullish across 50% \(\+14\.0 pp\)/i,
      }),
    )

    const explanation = screen.getByTestId('forecast-shift-explanation')
    expect(explanation).toHaveTextContent(/selected forecast shift/i)
    expect(explanation).toHaveTextContent('44.0%')
    expect(explanation).toHaveTextContent('58.0%')
    expect(explanation).toHaveTextContent('+14.0 pp')
    expect(
      screen.getByRole('radio', {
        name: /1-day flipped bullish across 50% \(\+14\.0 pp\).*2024-09-13 → 2024-09-16/i,
      }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(within(explanation).getByText(/context, not causation/i)).toBeInTheDocument()
    expect(explanation).toHaveTextContent(/correlational background, not proof of what caused/i)

    const changes = within(explanation).getByRole('list', {
      name: /largest market condition changes for selected forecast shift/i,
    })
    expect(changes.querySelectorAll('li').length).toBeGreaterThan(0)
    expect(changes.textContent).toMatch(/from .+ to /i)
    expect(changes.textContent).not.toMatch(/caused|because of|due to the model/i)
  })

  it('updates the explanation when a different shift is selected', async () => {
    const user = userEvent.setup()
    render(
      <ForecastProbabilityTimeline
        forecast={demoForecast}
        historyRecords={demoHistory.records}
        market={demoMarket}
      />,
    )

    await user.click(
      screen.getByRole('radio', {
        name: /1-day flipped bearish across 50% \(-23\.0 pp\)/i,
      }),
    )

    const explanation = screen.getByTestId('forecast-shift-explanation')
    expect(explanation).toHaveTextContent('71.0%')
    expect(explanation).toHaveTextContent('48.0%')
    expect(explanation).toHaveTextContent('-23.0 pp')
    expect(
      screen.getByRole('radio', {
        name: /1-day flipped bearish across 50% \(-23\.0 pp\).*2024-09-05 → 2024-09-06/i,
      }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('explains a selected shift when market series is missing', async () => {
    const user = userEvent.setup()
    render(
      <ForecastProbabilityTimeline
        forecast={demoForecast}
        historyRecords={demoHistory.records}
      />,
    )

    await user.click(
      screen.getByRole('radio', {
        name: /1-day flipped bullish across 50% \(\+14\.0 pp\)/i,
      }),
    )

    const explanation = screen.getByTestId('forecast-shift-explanation')
    expect(explanation).toHaveTextContent('44.0%')
    expect(explanation).toHaveTextContent('58.0%')
    expect(explanation).toHaveTextContent(
      /market series data is not available, so indicator shifts between these two forecast sessions/i,
    )
    expect(
      within(explanation).queryByRole('list', {
        name: /largest market condition changes for selected forecast shift/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('does not highlight ordinary small probability wiggles', () => {
    const history = [
      mkRecord('2024-09-13', 1, 0.56),
      mkRecord('2024-09-13', 5, 0.54),
      mkRecord('2024-09-16', 1, 0.58),
      mkRecord('2024-09-16', 5, 0.55),
    ]
    const forecast: ForecastResponse = {
      ...demoForecast,
      one_day: { ...demoForecast.one_day!, prob_up: 0.58 },
      five_day: { ...demoForecast.five_day!, prob_up: 0.55 },
    }

    render(
      <ForecastProbabilityTimeline forecast={forecast} historyRecords={history} />,
    )

    const legend = screen.getByRole('list', {
      name: /forecast probability history legend/i,
    })
    expect(legend).not.toHaveTextContent(/meaningful shift/i)
    expect(screen.getByRole('note').textContent).toMatch(
      /no meaningful shifts in this window/i,
    )
    expect(
      screen.queryByText(/larger markers highlight directional flips/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('radiogroup', { name: /meaningful forecast shifts/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('forecast-evolution-summary')).toHaveTextContent(
      /no lasting lean in recent forecasts/i,
    )
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
