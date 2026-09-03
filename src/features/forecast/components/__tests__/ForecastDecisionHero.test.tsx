import type { ComponentProps } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForecastDecisionHero } from '../ForecastDecisionHero'
import { demoForecast, demoMarket } from '../../demo/demoResponses'
import type { ForecastResponse, HorizonForecast } from '../../api/types'

function renderHero(
  overrides: Partial<ComponentProps<typeof ForecastDecisionHero>> = {},
) {
  return render(
    <ForecastDecisionHero
      forecast={demoForecast}
      market={demoMarket}
      effectiveMode="live"
      {...overrides}
    />,
  )
}

function horizonWithProb(base: HorizonForecast, probUp: number): HorizonForecast {
  return {
    ...base,
    prob_up: probUp,
    prob_down: 1 - probUp,
    direction: probUp >= 0.5 ? 'up' : 'down',
  }
}

function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

describe('ForecastDecisionHero', () => {
  it('keeps outlook context and treats the interpretation as the primary summary', () => {
    renderHero()

    expect(screen.getByText('SPY market outlook')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /what the model currently predicts/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Educational analysis')).toBeInTheDocument()
    expect(screen.getByText('Live data')).toBeInTheDocument()

    const interpretation = screen.getByTestId('forecast-interpretation')
    expect(interpretation).toHaveTextContent(/upward/i)
    expect(interpretation).toHaveTextContent(/no strong five-session/i)
    expect(interpretation.className).toMatch(/text-2xl|text-3xl/)
  })

  it('presents 1-day and 5-day forecasts as distinct cards with direction, probability, confidence, and bars', () => {
    renderHero()

    const oneDay = screen.getByRole('article', { name: /next trading day/i })
    expect(within(oneDay).getByText('1-Day')).toBeInTheDocument()
    expect(within(oneDay).getByText('Next trading day')).toBeInTheDocument()
    expect(within(oneDay).getByText('Model leans upward')).toBeInTheDocument()
    expect(within(oneDay).getByText('58.0%')).toBeInTheDocument()
    expect(within(oneDay).getByText('Moderate confidence')).toBeInTheDocument()
    expect(
      within(oneDay).getByRole('progressbar', {
        name: /next trading day — probability up vs down/i,
      }),
    ).toBeInTheDocument()

    const fiveDay = screen.getByRole('article', {
      name: /next five trading sessions/i,
    })
    expect(within(fiveDay).getByText('5-Day')).toBeInTheDocument()
    expect(within(fiveDay).getByText('Next five trading sessions')).toBeInTheDocument()
    expect(within(fiveDay).getByText('No strong directional edge')).toBeInTheDocument()
    expect(within(fiveDay).getByText('54.0%')).toBeInTheDocument()
    expect(within(fiveDay).getByText('Low confidence')).toBeInTheDocument()
    expect(
      within(fiveDay).getByRole('img', { name: /direction: no strong edge/i }),
    ).toBeInTheDocument()
    expect(
      within(fiveDay).getByRole('progressbar', {
        name: /next five trading sessions — probability up vs down/i,
      }),
    ).toBeInTheDocument()
  })

  it('keeps latest close and metadata without replacing the forecast summary', () => {
    renderHero()

    expect(screen.getByText(/SPY last close/i)).toBeInTheDocument()
    expect(screen.getByText('Latest completed session')).toBeInTheDocument()
    expect(screen.getByText('Market data as of')).toBeInTheDocument()
    expect(screen.getByText('Selected model')).toBeInTheDocument()
    expect(screen.getByText('Model version')).toBeInTheDocument()
    expect(
      screen.getByText(/Model output is probabilistic and may be wrong/i),
    ).toBeInTheDocument()
  })

  it('preserves refresh behavior and the refreshing label', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const { rerender } = renderHero({ onRefresh, isRefreshing: false })

    const button = screen.getByRole('button', { name: /refresh forecast data/i })
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Refresh')
    await user.click(button)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    rerender(
      <ForecastDecisionHero
        forecast={demoForecast}
        market={demoMarket}
        effectiveMode="live"
        onRefresh={onRefresh}
        isRefreshing
      />,
    )
    const refreshing = screen.getByRole('button', { name: /refresh forecast data/i })
    expect(refreshing).toBeDisabled()
    expect(refreshing).toHaveTextContent('Refreshing…')
  })

  it('shows the loading state when no forecast has arrived', () => {
    renderHero({
      forecast: undefined,
      isLoading: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent(/loading the latest forecast/i)
    expect(screen.queryByTestId('forecast-interpretation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /copy outlook/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a truthful model-unavailable state', () => {
    const unavailable: ForecastResponse = {
      ...demoForecast,
      one_day: null,
      five_day: null,
      model_unavailable: true,
      reason: 'No trained model artifacts',
    }
    renderHero({ forecast: unavailable, modelUnavailableReason: unavailable.reason })
    expect(
      screen.getByText(/Model unavailable — no forecast to display/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/No trained model artifacts/i)).toBeInTheDocument()
    expect(screen.queryByTestId('forecast-interpretation')).not.toBeInTheDocument()
  })

  it('keeps the demo-backend banner and disables refresh', () => {
    renderHero({
      effectiveMode: 'demo',
      demoBackendUnavailable: true,
      onRefresh: vi.fn(),
    })
    expect(screen.getByText('Demo data — backend unavailable')).toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh forecast data/i })).toBeDisabled()
  })

  it('surfaces stale and simulated modes as secondary labels', () => {
    const { rerender } = renderHero({ effectiveMode: 'stale' })
    expect(screen.getByText('Stale cache')).toBeInTheDocument()
    expect(
      screen.getByText(/last successful cached response/i),
    ).toBeInTheDocument()

    rerender(
      <ForecastDecisionHero
        forecast={demoForecast}
        market={demoMarket}
        effectiveMode="simulated"
      />,
    )
    expect(screen.getByText('Simulated data')).toBeInTheDocument()
    expect(screen.getByText(/Synthetic workbook session/i)).toBeInTheDocument()
  })

  it('renders a downward lean without trading-advice language', () => {
    const downForecast: ForecastResponse = {
      ...demoForecast,
      one_day: horizonWithProb(demoForecast.one_day!, 0.32),
      five_day: horizonWithProb(demoForecast.five_day!, 0.54),
    }
    renderHero({ forecast: downForecast })

    const oneDay = screen.getByRole('article', { name: /next trading day/i })
    expect(within(oneDay).getByText(/leans strongly downward/i)).toBeInTheDocument()
    expect(within(oneDay).getByText('68.0%')).toBeInTheDocument()
    expect(within(oneDay).getByRole('img', { name: /direction: down/i })).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/\bBUY\b/)
    expect(document.body.textContent ?? '').not.toMatch(/\bSELL\b/)
  })

  it('copies the currently displayed outlook and shows Copied', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    renderHero()

    const button = screen.getByRole('button', { name: 'Copy outlook' })
    expect(button).toBeEnabled()
    await user.click(button)

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('SPY Market Outlook')
    expect(copied).toContain('1-day outlook: Model leans upward')
    expect(copied).toContain('1-day probability up: 58.0%')
    expect(copied).toContain('5-day outlook: No strong directional edge')
    expect(copied).toContain('5-day probability up: 54.0%')
    expect(copied).toContain('Educational analysis only — not financial advice.')

    expect(
      await screen.findByRole('button', { name: /outlook copied to clipboard/i }),
    ).toHaveTextContent('Copied')
  })

  it('still offers copy outlook when only one horizon is available', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    mockClipboard(writeText)

    const oneHorizon: ForecastResponse = {
      ...demoForecast,
      five_day: null,
    }
    renderHero({ forecast: oneHorizon })

    await user.click(screen.getByRole('button', { name: 'Copy outlook' }))
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('1-day outlook: Model leans upward')
    expect(copied).toContain('5-day outlook: Unavailable')
    expect(copied).toContain('5-day probability up: Unavailable')
  })

  it('hides copy outlook when no useful forecast exists', () => {
    const unavailable: ForecastResponse = {
      ...demoForecast,
      one_day: null,
      five_day: null,
      model_unavailable: true,
      reason: 'No trained model artifacts',
    }
    renderHero({ forecast: unavailable, modelUnavailableReason: unavailable.reason })
    expect(
      screen.queryByRole('button', { name: /copy outlook/i }),
    ).not.toBeInTheDocument()
  })

  it('handles clipboard failure without crashing', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    mockClipboard(writeText)

    renderHero()
    await user.click(screen.getByRole('button', { name: 'Copy outlook' }))

    expect(
      await screen.findByRole('button', { name: /could not copy outlook/i }),
    ).toHaveTextContent('Copy failed')
    expect(screen.getByTestId('forecast-interpretation')).toBeInTheDocument()
  })
})
