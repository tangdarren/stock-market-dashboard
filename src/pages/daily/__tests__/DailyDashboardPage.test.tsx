import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyDashboardPage } from '../DailyDashboardPage'
import { renderWithProviders } from '@/test/renderPage'
import { server } from '@/test/msw/server'
import {
  backendDownHandlers,
  modelUnavailableHandlers,
  staleHandlers,
  successHandlers,
} from '@/test/msw/handlers'

describe('DailyDashboardPage', () => {
  beforeEach(() => {
    server.use(...successHandlers)
  })

  it('renders live forecast, snapshot, explanation, and methodology sections', async () => {
    renderWithProviders(<DailyDashboardPage />)

    expect(await screen.findByRole('heading', { name: /SPY Forecast Lab/i })).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByText(/Features based on the latest completed trading session/i)).toBeInTheDocument(),
    )

    expect(screen.getByText(/Next trading day/i)).toBeInTheDocument()
    expect(screen.getByText(/Next five sessions/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Current SPY snapshot/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Recent SPY closing price/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Out-of-sample holdout evaluation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /What's under the hood/i })).toBeInTheDocument()
    expect(screen.getAllByText(/probabilistic and may be wrong/i).length).toBeGreaterThan(0)
  })

  it('shows the backend-unavailable card without silently switching to demo data', async () => {
    server.use(...backendDownHandlers)
    renderWithProviders(<DailyDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: /Backend unavailable/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Cannot reach backend/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show sample data/i })).toBeInTheDocument()

    expect(screen.getAllByText(/Model output is probabilistic/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Demo data — backend unavailable/i)).not.toBeInTheDocument()
  })

  it('opts into demo mode only when the user clicks the demo button and shows the demo banner', async () => {
    server.use(...backendDownHandlers)
    const user = userEvent.setup()
    renderWithProviders(<DailyDashboardPage />)

    const demoButton = await screen.findByRole('button', { name: /Show sample data/i })
    await user.click(demoButton)

    expect(
      await screen.findByText(/Demo data — backend unavailable/i),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Demo data/i).length).toBeGreaterThan(1)

    // Sample timestamps do not imply live data.
    expect(screen.getAllByText(/Sample —/i).length).toBeGreaterThan(0)
  })

  it('shows the model-unavailable card when the backend reports missing artifacts', async () => {
    server.use(...modelUnavailableHandlers)
    renderWithProviders(<DailyDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: /Model unavailable/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No trained model artifacts/i)).toBeInTheDocument()
  })

  it('shows the stale-cache indicator when the backend returns stale data', async () => {
    server.use(...staleHandlers)
    renderWithProviders(<DailyDashboardPage />)

    const staleBadges = await screen.findAllByText(/Stale cache/i)
    expect(staleBadges.length).toBeGreaterThan(0)
  })

  it('surfaces weak-metric context in the model performance panel', async () => {
    renderWithProviders(<DailyDashboardPage />)
    const perf = await screen.findByRole('heading', { name: /Out-of-sample holdout evaluation/i })
    const panel = perf.closest('div')!.parentElement!.parentElement!
    expect(within(panel).getByText('Accuracy')).toBeInTheDocument()
    expect(within(panel).getByText('ROC-AUC')).toBeInTheDocument()
    expect(within(panel).getByText('Brier')).toBeInTheDocument()
  })
})
