import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MainLayout } from '../MainLayout'

function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<div>Page body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MainLayout', () => {
  it('renders a skip link before the navbar that targets main content', () => {
    renderLayout()

    const skip = screen.getByRole('link', { name: /skip to main content/i })
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(skip.className).toMatch(/sr-only/)
    expect(skip.className).toMatch(/focus:not-sr-only/)

    const main = document.getElementById('main-content')
    expect(main).toBeTruthy()
    expect(main!.tagName).toBe('MAIN')
    expect(main).toHaveAttribute('tabIndex', '-1')

    const brandLinks = screen.getAllByRole('link', { name: /tempest/i })
    expect(
      skip.compareDocumentPosition(brandLinks[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps main content focusable for skip navigation without a persistent outline', () => {
    renderLayout()
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(main.className).toMatch(/outline-none/)
  })
})
