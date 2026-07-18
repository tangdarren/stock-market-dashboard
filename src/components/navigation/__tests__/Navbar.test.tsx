import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Navbar } from '../Navbar'

function renderNavbar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Navbar />
    </MemoryRouter>,
  )
}

describe('Navbar', () => {
  it('does not render the "Open Dashboard" CTA', () => {
    renderNavbar()
    expect(screen.queryByRole('link', { name: /open dashboard/i })).toBeNull()
    expect(screen.queryByText(/open dashboard/i)).toBeNull()
  })

  it('keeps the primary navigation links (Market included)', () => {
    renderNavbar()
    // Both the desktop and mobile inline navs render Market — either is fine.
    expect(screen.getAllByRole('link', { name: /market/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /home/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /learn/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /about/i }).length).toBeGreaterThan(0)
  })

  it('marks the current route with aria-current="page"', () => {
    renderNavbar('/market')
    const marketLinks = screen.getAllByRole('link', { name: /market/i })
    expect(marketLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('exposes an accessible name on the primary navigation landmarks', () => {
    renderNavbar()
    expect(screen.getByRole('navigation', { name: /primary$/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary mobile/i })).toBeInTheDocument()
  })
})
