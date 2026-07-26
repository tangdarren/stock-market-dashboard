import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReplayWorkflowStepper } from '../ReplayWorkflowStepper'

describe('ReplayWorkflowStepper', () => {
  it('marks the active step with current-step treatment', () => {
    render(<ReplayWorkflowStepper phase="configuring" />)

    const active = screen.getByText(/^configure prediction$/i).closest('li')
    expect(active).toHaveAttribute('aria-current', 'step')
    expect(active).toHaveAttribute('data-state', 'active')
    expect(active?.className).toMatch(/bg-\[#00FFB2\]\/20/)
    expect(active?.className).toMatch(/border-\[#00FFB2\]\/70/)
    expect(screen.getByText(/^current step$/i)).toBeInTheDocument()

    const completed = screen.getByText(/^review session$/i).closest('li')
    expect(completed).toHaveAttribute('data-state', 'complete')
    expect(screen.getByText(/^completed$/i)).toBeInTheDocument()

    const upcoming = screen.getByText(/^prediction locked$/i).closest('li')
    expect(upcoming).toHaveAttribute('data-state', 'upcoming')

    expect(screen.getByTestId('workflow-instruction')).toHaveTextContent(
      /choose a horizon and direction/i,
    )
  })
})
