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

async function findInterpretation() {
  return await screen.findByTestId('forecast-interpretation')
}

describe('DailyDashboardPage', () => {
  beforeEach(() => {
    server.use(...successHandlers)
  })

  it('shows the top-of-page prediction summary with 1-day and 5-day outlook and reliable-language for low confidence', async () => {
    renderWithProviders(<DailyDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: /what the model currently predicts/i }),
    ).toBeInTheDocument()

    // Both horizons are visible near the top.
    expect(screen.getByText(/Next trading day/i)).toBeInTheDocument()
    expect(screen.getByText(/Next five trading sessions/i)).toBeInTheDocument()

    // Demo data has 1-day prob 0.58 (leans upward), 5-day prob 0.54 (no edge).
    const interpretation = await findInterpretation()
    expect(interpretation.textContent).toMatch(/upward/i)
    expect(interpretation.textContent).toMatch(/no strong five-session/i)

    // Low-confidence phrase must appear for the 5-day block.
    expect(screen.getByText(/No strong directional edge/i)).toBeInTheDocument()
  })

  it('renders every major section heading in the correct order', async () => {
    renderWithProviders(<DailyDashboardPage />)

    // Wait for the last section (Methodology) to render, ensuring every
    // preceding section has also mounted before we snapshot the heading order.
    await screen.findByRole('heading', { name: /methodology and limitations/i })

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent?.trim() ?? '')
      .filter((t) => t.length > 0)

    const expectedOrder = [
      /current market conditions/i,
      /why the model leans this way/i,
      /how reliable has the model been/i,
      /historical forecast review/i,
      /educational strategy simulation/i,
      /current news context/i,
      /methodology and limitations/i,
    ]

    // For each expected heading, find its position and assert the previous
    // ones all appeared before it.
    const positions = expectedOrder.map((re) =>
      headings.findIndex((t) => re.test(t)),
    )
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0))
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
  })

  it('renders the local section navigation with anchor links', async () => {
    renderWithProviders(<DailyDashboardPage />)
    const nav = await screen.findByRole('navigation', { name: /forecast page sections/i })
    expect(within(nav).getByRole('link', { name: /outlook/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /market conditions/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /performance/i })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /methodology/i })).toBeInTheDocument()
  })

  it('keeps the financial disclaimer, baseline comparison badge, and news-not-in-model caveat visible', async () => {
    renderWithProviders(<DailyDashboardPage />)
    // News caveat lives in the section description; wait until the news
    // section header has mounted before asserting it.
    await screen.findByRole('heading', { name: /current news context/i })
    expect(
      screen.getAllByText(/probabilistic and may be wrong/i).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(/not used by the forecasting model/i),
    ).toBeInTheDocument()
  })

  it('surfaces the plain-English performance summary and baseline metrics', async () => {
    renderWithProviders(<DailyDashboardPage />)
    const summary = await screen.findByTestId('performance-summary-headline')
    expect(summary.textContent).toMatch(/(outperformed|similarly|underperformed|in line)/i)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: /how reliable has the model been/i,
        }),
      ).toBeInTheDocument(),
    )
    const perfSection = screen
      .getByRole('heading', { name: /how reliable has the model been/i })
      .closest('section') as HTMLElement
    // "Accuracy" appears in both the metric pill and the baselines table —
    // asserting length > 0 keeps the test resilient to that.
    expect(within(perfSection).getAllByText(/^Accuracy$/i).length).toBeGreaterThan(0)
    expect(within(perfSection).getAllByText(/^ROC-AUC$/i).length).toBeGreaterThan(0)
    expect(within(perfSection).getAllByText(/^Brier$/i).length).toBeGreaterThan(0)
    expect(within(perfSection).getByText(/Chronological holdout/i)).toBeInTheDocument()
  })

  it('renders historical forecasts with a horizon filter and both desktop/mobile representations', async () => {
    renderWithProviders(<DailyDashboardPage />)
    const historySection = (
      await screen.findByRole('heading', { name: /historical forecast review/i })
    ).closest('section')!

    // Both filter buttons render as tabs.
    expect(within(historySection).getByRole('tab', { name: /1-day/i })).toBeInTheDocument()
    expect(within(historySection).getByRole('tab', { name: /5-day/i })).toBeInTheDocument()
    expect(within(historySection).getByRole('tab', { name: /all horizons/i })).toBeInTheDocument()

    // Desktop table caption present (announced to screen readers).
    expect(
      within(historySection).getByText(/Recent out-of-sample historical forecasts/i),
    ).toBeInTheDocument()

    // Mobile list has an aria-label describing the current filter.
    expect(
      within(historySection).getByRole('list', {
        name: /historical forecasts \(1-day\)/i,
      }),
    ).toBeInTheDocument()
  })

  it('shows the backend-unavailable card without silently switching to demo data', async () => {
    server.use(...backendDownHandlers)
    renderWithProviders(<DailyDashboardPage />)

    expect(
      await screen.findByRole('heading', { name: /Backend unavailable/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Cannot reach backend/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show sample data/i })).toBeInTheDocument()

    // Disclaimer is still shown, the "demo — backend unavailable" banner is NOT.
    expect(screen.getAllByText(/Model output is probabilistic/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Demo data — backend unavailable/i)).not.toBeInTheDocument()
  })

  it('opts into demo mode only when the user clicks and shows a persistent demo banner', async () => {
    server.use(...backendDownHandlers)
    const user = userEvent.setup()
    renderWithProviders(<DailyDashboardPage />)

    const demoButton = await screen.findByRole('button', { name: /Show sample data/i })
    await user.click(demoButton)

    expect(await screen.findByText(/Demo data — backend unavailable/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Demo data/i).length).toBeGreaterThan(1)
    expect(screen.getAllByText(/Sample —/i).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: /turn off sample data/i }),
    ).toBeInTheDocument()
  })

  it('shows a truthful model-unavailable state inside the hero when artifacts are missing', async () => {
    server.use(...modelUnavailableHandlers)
    renderWithProviders(<DailyDashboardPage />)

    // Truthful state is surfaced both inline in the hero AND in a companion
    // error card. Assert both, plus at least one occurrence of the reason.
    expect(
      await screen.findByText(/Model unavailable — no forecast to display/i),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /Model unavailable/i }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/No trained model artifacts/i).length,
    ).toBeGreaterThan(0)
  })

  it('shows the stale-cache indicator when the backend returns stale data', async () => {
    server.use(...staleHandlers)
    renderWithProviders(<DailyDashboardPage />)

    const staleBadges = await screen.findAllByText(/Stale cache/i)
    expect(staleBadges.length).toBeGreaterThan(0)
  })
})
