import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { MainLayout } from '@/app/layouts/MainLayout'
import { ReplayLabPage } from '@/pages/replay/ReplayLabPage'
import { ROUTES } from '@/lib/constants/routes'

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false, gcTime: 0 },
    },
  })
}

export function renderWithProviders(ui: ReactNode, initialEntries: string[] = ['/']) {
  const client = createTestClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Mount the real layout + /replay route for integration coverage. */
export function renderReplayRoute(initialEntries: string[] = [ROUTES.REPLAY]) {
  const client = createTestClient()
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path={ROUTES.REPLAY} element={<ReplayLabPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
