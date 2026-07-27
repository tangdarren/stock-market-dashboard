import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from '../Footer'
import { SITE } from '@/lib/constants/site'
import { ROUTES } from '@/lib/constants/routes'

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
}

describe('Footer', () => {
  it('uses higher-contrast muted text against the dark background', () => {
    renderFooter()
    const footer = screen.getByRole('contentinfo')
    const copy = footer.querySelector('p')
    expect(copy).toBeTruthy()
    expect(copy!.className).toMatch(/text-slate-400/)
    expect(copy!.className).not.toMatch(/text-slate-700/)
    expect(footer).toHaveTextContent(new RegExp(`Built by ${SITE.author}`, 'i'))
  })

  it('exposes the site name as a link with hover and focus-visible styles', () => {
    renderFooter()
    const home = screen.getByRole('link', { name: SITE.name })
    expect(home).toHaveAttribute('href', ROUTES.HOME)
    expect(home.className).toMatch(/text-slate-400/)
    expect(home.className).toMatch(/hover:text-slate-200/)
    expect(home.className).toMatch(/focus-visible:ring/)
  })

  it('keeps the educational disclaimer in the footer copy', () => {
    renderFooter()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(/not financial advice/i)
  })
})
