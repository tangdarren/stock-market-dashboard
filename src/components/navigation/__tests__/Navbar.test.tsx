import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
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

  it('exposes an accessible name on the primary navigation landmark', () => {
    renderNavbar()
    expect(screen.getByRole('navigation', { name: /primary$/i })).toBeInTheDocument()
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

  it('stays interactive while scrolled instead of hiding', () => {
    renderNavbar()
    const header = document.querySelector('header')
    expect(header).toBeTruthy()

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
      window.dispatchEvent(new Event('scroll'))
    })

    expect(header!.className).not.toMatch(/opacity-0/)
    expect(header!.className).not.toMatch(/pointer-events-none/)
    expect(header!.className).toMatch(/backdrop-blur/)
    expect(header!.className).toMatch(/border/)
  })

  it('opens a mobile menu with aria-expanded/controls, routes, and simulated toggle', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    const menuId = menuButton.getAttribute('aria-controls')
    expect(menuId).toBeTruthy()

    await user.click(menuButton)

    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(menuButton).toHaveAccessibleName(/close menu/i)

    const mobileNav = document.getElementById(menuId!)
    expect(mobileNav).toBeTruthy()
    expect(mobileNav).toHaveAttribute('aria-label', 'Primary mobile')

    const mobile = within(mobileNav!)
    expect(mobile.getByRole('link', { name: /^home$/i })).toBeInTheDocument()
    expect(mobile.getByRole('link', { name: /^market$/i })).toBeInTheDocument()
    expect(mobile.getByRole('link', { name: /replay lab/i })).toBeInTheDocument()
    expect(mobile.getByRole('link', { name: /model monitor/i })).toBeInTheDocument()
    expect(mobile.getByRole('link', { name: /^learn$/i })).toBeInTheDocument()
    expect(mobile.getByRole('link', { name: /^about$/i })).toBeInTheDocument()
    expect(mobile.getByRole('switch', { name: /simulated data/i })).toBeInTheDocument()
  })

  it('closes the mobile menu after selecting a route', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    await user.click(menuButton)

    const menuId = menuButton.getAttribute('aria-controls')!
    const mobileNav = document.getElementById(menuId)!
    await user.click(within(mobileNav).getByRole('link', { name: /^about$/i }))

    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(menuId)).toBeNull()
  })

  it('closes the mobile menu when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')

    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton).toHaveFocus()
  })

  it('applies visible keyboard focus styles on the menu button and mobile links', async () => {
    const user = userEvent.setup()
    renderNavbar()

    const menuButton = screen.getByRole('button', { name: /open menu/i })
    expect(menuButton.className).toMatch(/focus-visible:ring/)

    await user.click(menuButton)
    const menuId = menuButton.getAttribute('aria-controls')!
    const aboutLink = within(document.getElementById(menuId)!).getByRole('link', {
      name: /^about$/i,
    })
    expect(aboutLink.className).toMatch(/focus-visible:ring/)
  })
})
