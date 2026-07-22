import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import { demoModelMonitoringUnavailable } from '@/features/model-monitor/demo/demoResponses'
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
    expect(
      screen.getByRole('heading', { name: /visualization placeholders/i }),
    ).toBeInTheDocument()
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
