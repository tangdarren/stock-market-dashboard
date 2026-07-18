import { render, screen } from '@testing-library/react'
import { ProbabilityBar } from '../ProbabilityBar'

describe('ProbabilityBar', () => {
  it('exposes accessible progressbar semantics with correct values', () => {
    render(<ProbabilityBar probUp={0.62} label="Test probability" />)
    const bar = screen.getByRole('progressbar', { name: /test probability/i })
    expect(bar).toHaveAttribute('aria-valuenow', '62')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('clamps out-of-range probabilities', () => {
    const { rerender } = render(<ProbabilityBar probUp={-0.5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    rerender(<ProbabilityBar probUp={1.4} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('provides textual labels alongside the visual bar', () => {
    render(<ProbabilityBar probUp={0.55} />)
    expect(screen.getByText(/Up 55.0%/)).toBeInTheDocument()
    expect(screen.getByText(/Down 45.0%/)).toBeInTheDocument()
  })
})
