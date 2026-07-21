import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReplayStatusPanel } from '../ReplayStatusPanel'

describe('ReplayStatusPanel', () => {
  it('surfaces client invalid-date copy with an accessible heading', () => {
    render(
      <ReplayStatusPanel
        isLoading={false}
        backendUnavailable={false}
        clientError="Enter a valid date as YYYY-MM-DD."
        onSelectNearby={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /invalid date/i })).toBeInTheDocument()
    expect(screen.getByText(/enter a valid date as yyyy-mm-dd/i)).toBeInTheDocument()
  })

  it('keeps machine reason codes in an sr-only status for assistive tech', () => {
    render(
      <ReplayStatusPanel
        isLoading={false}
        backendUnavailable={false}
        clientError={null}
        unavailableReason="weekend"
        unavailableDetail="2024-01-06 falls on a weekend; SPY does not trade."
        nearestBefore="2024-01-05"
        nearestAfter="2024-01-08"
        onSelectNearby={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: /weekend date/i })).toBeInTheDocument()
    expect(screen.getByText(/reason code: weekend/i)).toHaveClass('sr-only')
    expect(screen.getByRole('button', { name: /before: 2024-01-05/i })).toBeInTheDocument()
  })
})
