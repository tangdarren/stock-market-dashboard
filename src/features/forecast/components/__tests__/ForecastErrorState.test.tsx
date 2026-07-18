import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ForecastErrorState } from '../ForecastErrorState'

describe('ForecastErrorState', () => {
  it('shows the backend-unavailable message and the API base URL', () => {
    render(
      <ForecastErrorState
        message="Cannot reach backend"
        reason="backend_unavailable"
      />,
    )
    expect(screen.getByText(/Backend unavailable/)).toBeInTheDocument()
    expect(screen.getByText(/Cannot reach backend/)).toBeInTheDocument()
    expect(screen.getByText(/backend_unavailable/)).toBeInTheDocument()
  })

  it('triggers callbacks for retry and demo actions', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const onUseDemo = vi.fn()
    render(
      <ForecastErrorState
        message="Cannot reach backend"
        onRetry={onRetry}
        onUseDemo={onUseDemo}
      />,
    )
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await user.click(screen.getByRole('button', { name: /sample data/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onUseDemo).toHaveBeenCalledTimes(1)
  })
})
