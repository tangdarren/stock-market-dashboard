import { render, screen } from '@testing-library/react'
import { ModeBadge } from '../ModeBadge'

describe('ModeBadge', () => {
  it('shows a distinct label for each mode', () => {
    const { rerender } = render(<ModeBadge mode="live" />)
    expect(screen.getByText('Live data')).toBeInTheDocument()

    rerender(<ModeBadge mode="demo" />)
    expect(screen.getByText('Demo data')).toBeInTheDocument()

    rerender(<ModeBadge mode="stale" />)
    expect(screen.getByText('Stale cache')).toBeInTheDocument()

    rerender(<ModeBadge mode="model_unavailable" />)
    expect(screen.getByText('Model unavailable')).toBeInTheDocument()

    rerender(<ModeBadge mode="unavailable" />)
    expect(screen.getByText('Backend unavailable')).toBeInTheDocument()
  })
})
