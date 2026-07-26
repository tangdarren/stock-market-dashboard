import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReplayPredictionForm } from '../ReplayPredictionForm'
import { CONFIDENCE_MIN } from '../../utils/prediction'

describe('ReplayPredictionForm', () => {
  it('renders default confidence at 50% matching application state', () => {
    render(
      <ReplayPredictionForm
        draft={{ horizon: null, direction: null, confidence: CONFIDENCE_MIN }}
        frozen={false}
        canLock={false}
        onHorizonChange={vi.fn()}
        onDirectionChange={vi.fn()}
        onConfidenceChange={vi.fn()}
        onLock={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/confidence/i) as HTMLInputElement
    expect(input.value).toBe('50')
    expect(input).toHaveAttribute('aria-valuenow', '50')
    expect(input).toHaveAttribute('aria-valuetext', '50 percent')
  })

  it('applies visible option classes and selected direction treatments', async () => {
    const user = userEvent.setup()
    const onHorizonChange = vi.fn()
    const onDirectionChange = vi.fn()

    const { rerender } = render(
      <ReplayPredictionForm
        draft={{ horizon: null, direction: null, confidence: 50 }}
        frozen={false}
        canLock={false}
        onHorizonChange={onHorizonChange}
        onDirectionChange={onDirectionChange}
        onConfidenceChange={vi.fn()}
        onLock={vi.fn()}
      />,
    )

    const oneDay = screen.getByRole('radio', { name: /one trading session/i })
    expect(oneDay.className).toMatch(/bg-white\/\[0\.05\]/)
    expect(oneDay.className).toMatch(/border-white\/20/)

    await user.click(oneDay)
    expect(onHorizonChange).toHaveBeenCalledWith(1)

    rerender(
      <ReplayPredictionForm
        draft={{ horizon: 1, direction: 'down', confidence: 50 }}
        frozen={false}
        canLock={true}
        onHorizonChange={onHorizonChange}
        onDirectionChange={onDirectionChange}
        onConfidenceChange={vi.fn()}
        onLock={vi.fn()}
      />,
    )

    const selectedHorizon = screen.getByRole('radio', { name: /one trading session/i })
    const down = screen.getByRole('radio', { name: /^down$/i })
    expect(selectedHorizon.className).toMatch(/bg-\[#00FFB2\]\/15/)
    expect(down.className).toMatch(/bg-red-400\/15/)
    expect(down.className).toMatch(/text-red-300/)

    const lock = screen.getByRole('button', { name: /lock prediction/i })
    expect(lock.className).toMatch(/bg-\[#00FFB2\]/)
    expect(lock.className).toMatch(/text-black/)
    expect(lock).toBeEnabled()
  })
})
