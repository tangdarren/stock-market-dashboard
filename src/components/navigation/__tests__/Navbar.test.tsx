import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Navbar } from '../Navbar'
import { SIMULATED_DATA_STORAGE_KEY } from '@/features/simulated/useSimulatedDataMode'

function renderNavbar(initialPath = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Navbar', () => {
  it('does not render the "Open Dashboard" CTA', () => {
    renderNavbar()
    expect(screen.queryByRole('link', { name: /open dashboard/i })).toBeNull()
    expect(screen.queryByText(/open dashboard/i)).toBeNull()
  })

  it('keeps the primary navigation links (Market, Replay Lab, and Model Monitor included)', () => {
    renderNavbar()
    // Both the desktop and mobile inline navs render each link — either is fine.
    expect(screen.getAllByRole('link', { name: /market/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /replay lab/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /model monitor/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /learn/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /about/i }).length).toBeGreaterThan(0)
  })

  it('marks the current route with aria-current="page"', () => {
    renderNavbar('/market')
    const marketLinks = screen.getAllByRole('link', { name: /market/i })
    expect(marketLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('marks Replay Lab as current on /replay', () => {
    renderNavbar('/replay')
    const replayLinks = screen.getAllByRole('link', { name: /replay lab/i })
    expect(replayLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('marks Model Monitor as current on /monitor', () => {
    renderNavbar('/monitor')
    const monitorLinks = screen.getAllByRole('link', { name: /model monitor/i })
    expect(monitorLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('exposes an accessible name on the primary navigation landmarks', () => {
    renderNavbar()
    expect(screen.getByRole('navigation', { name: /primary$/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary mobile/i })).toBeInTheDocument()
  })

  it('defaults simulated data to OFF and exposes accessible switch state in text', () => {
    renderNavbar()
    const toggle = screen.getByRole('switch', { name: /simulated data: off/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveTextContent('Simulated data: OFF')
  })

  it('toggles to ON, persists across remount, and returns to live OFF', async () => {
    const user = userEvent.setup()
    const { unmount } = renderNavbar()
    const toggle = screen.getByRole('switch', { name: /simulated data: off/i })
    await user.click(toggle)
    expect(screen.getByRole('switch', { name: /simulated data: on/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(window.localStorage.getItem(SIMULATED_DATA_STORAGE_KEY)).toBe('1')

    unmount()
    renderNavbar()
    expect(screen.getByRole('switch', { name: /simulated data: on/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    await user.click(screen.getByRole('switch', { name: /simulated data: on/i }))
    expect(screen.getByRole('switch', { name: /simulated data: off/i })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(window.localStorage.getItem(SIMULATED_DATA_STORAGE_KEY)).toBeNull()
  })
})
