import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import {
  demoModelMonitoringDrift,
  demoModelMonitoringUnavailable,
  demoModelMonitoringWatch,
} from '@/features/model-monitor/demo/demoResponses'
import { ENV } from '@/lib/api/env'
import { ROUTES } from '@/lib/constants/routes'
import { ModelMonitorPage } from '@/pages/model-monitor/ModelMonitorPage'
import { renderWithProviders } from '@/test/renderPage'
import { successHandlers, backendDownHandlers } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'

const base = `${ENV.API_BASE_URL}${ENV.API_PREFIX}`

function renderMonitorRoute(initialEntries: string[] = [ROUTES.MONITOR]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false, gcTime: 0 },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path={ROUTES.MONITOR} element={<ModelMonitorPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ModelMonitorPage', () => {
  beforeEach(() => {
    server.use(...successHandlers)
  })

  it('renders the page title and overall status from the monitoring API', async () => {
    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model monitor/i }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /model health is stable/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /performance summary/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /holdout comparison/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /chronological series/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /confidence versus actual accuracy/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /psi ranking/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /why status is stable/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/not a trading recommendation/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Overall status Stable$/i)).toBeInTheDocument()
  })

  it('lets users switch the rolling performance metric', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /chronological series/i }),
    ).toBeInTheDocument()

    const metricGroup = screen.getByRole('radiogroup', {
      name: /rolling performance metric/i,
    })
    await user.click(within(metricGroup).getByRole('radio', { name: /brier score/i }))
    expect(
      within(metricGroup).getByRole('radio', { name: /brier score/i }),
    ).toHaveAttribute('aria-checked', 'true')

    await user.click(
      within(metricGroup).getByRole('radio', { name: /calibration error/i }),
    )
    expect(
      within(metricGroup).getByRole('radio', { name: /calibration error/i }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('supports keyboard navigation across horizon and metric radiogroups', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model health is stable/i }),
    ).toBeInTheDocument()

    const horizonGroup = screen.getByRole('radiogroup', { name: /forecast horizon/i })
    const oneDay = within(horizonGroup).getByRole('radio', { name: /1-day/i })
    oneDay.focus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => {
      expect(within(horizonGroup).getByRole('radio', { name: /5-day/i })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    const metricGroup = screen.getByRole('radiogroup', {
      name: /rolling performance metric/i,
    })
    within(metricGroup).getByRole('radio', { name: /accuracy/i }).focus()
    await user.keyboard('{ArrowRight}')
    expect(
      within(metricGroup).getByRole('radio', { name: /brier score/i }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('reveals plain-English feature drift explanations', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${base}/model/monitoring`, () =>
        HttpResponse.json(demoModelMonitoringDrift()),
      ),
    )
    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(await screen.findByRole('heading', { name: /psi ranking/i })).toBeInTheDocument()
    const firstFeature = screen.getByText(/rsi 14/i)
    const details = firstFeature.closest('details')
    expect(details).not.toBeNull()
    await user.click(within(details as HTMLElement).getByText(/rsi 14/i))
    expect(
      await within(details as HTMLElement).findByText(/drifted versus training/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/rsi 14 psi/i)).toBeInTheDocument()
  })

  it('keeps horizon and window synchronized with the URL query string', async () => {
    const user = userEvent.setup()
    renderMonitorRoute([`${ROUTES.MONITOR}?horizon=1d&window=30`])

    expect(
      await screen.findByRole('heading', { name: /model health is stable/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /5-day/i }))
    await user.click(screen.getByRole('radio', { name: /60-session/i }))

    await waitFor(() => {
      expect(screen.getByText(/\?horizon=5d&window=60/i)).toBeInTheDocument()
    })

    const horizonGroup = screen.getByRole('radiogroup', { name: /forecast horizon/i })
    expect(within(horizonGroup).getByRole('radio', { name: /5-day/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const windowGroup = screen.getByRole('radiogroup', { name: /rolling window/i })
    expect(within(windowGroup).getByRole('radio', { name: /60-session/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('hydrates controls from an initial shared URL', async () => {
    renderMonitorRoute([`${ROUTES.MONITOR}?horizon=5d&window=120`])

    expect(
      await screen.findByRole('heading', { name: /model health is stable/i }),
    ).toBeInTheDocument()

    const horizonGroup = screen.getByRole('radiogroup', { name: /forecast horizon/i })
    expect(within(horizonGroup).getByRole('radio', { name: /5-day/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    const windowGroup = screen.getByRole('radiogroup', { name: /rolling window/i })
    expect(within(windowGroup).getByRole('radio', { name: /120-session/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('persists the 252-session window in the URL', async () => {
    const user = userEvent.setup()
    renderMonitorRoute([ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model health is stable/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /252-session/i }))
    await waitFor(() => {
      expect(screen.getByText(/\?horizon=1d&window=252/i)).toBeInTheDocument()
    })
  })

  it('renders watch status messaging and confidence gap copy', async () => {
    server.use(
      http.get(`${base}/model/monitoring`, () =>
        HttpResponse.json(demoModelMonitoringWatch()),
      ),
    )

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model health needs attention/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Overall status Watch$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Confidence health Watch$/i)).toBeInTheDocument()
    expect(screen.getAllByText(/overconfident/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/escalates when overconfidence/i)).toBeInTheDocument()
  })

  it('renders drift-detected status from feature PSI', async () => {
    server.use(
      http.get(`${base}/model/monitoring`, () =>
        HttpResponse.json(demoModelMonitoringDrift()),
      ),
    )

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model drift detected/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Overall status Drift detected$/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /why status is drift detected/i }),
    ).toBeInTheDocument()
  })

  it('shows a loading state before monitoring data arrives', async () => {
    server.use(
      http.get(`${base}/model/monitoring`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 80))
        return HttpResponse.json(demoModelMonitoringWatch())
      }),
    )

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])
    expect(screen.getByText(/loading model health/i)).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /model health needs attention/i }),
    ).toBeInTheDocument()
  })

  it('shows a generic request failure with retry', async () => {
    server.use(
      http.get(`${base}/model/monitoring`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    )

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /monitoring request failed/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows a truthful unavailable state when artifacts are missing', async () => {
    server.use(
      http.get(`${base}/model/monitoring`, () =>
        HttpResponse.json(demoModelMonitoringUnavailable),
      ),
    )

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /artifacts not ready/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/walk_forward_artifact_missing/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /performance summary/i })).toBeNull()
  })

  it('shows backend unavailable messaging when the API is down', async () => {
    server.use(...backendDownHandlers)

    renderWithProviders(<ModelMonitorPage />, [ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /backend unavailable/i }),
    ).toBeInTheDocument()
  })

  it('marks Model Monitor current in the primary nav on /monitor', async () => {
    renderMonitorRoute([ROUTES.MONITOR])

    expect(
      await screen.findByRole('heading', { name: /model monitor/i }),
    ).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /model monitor/i })
    expect(links.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })
})
