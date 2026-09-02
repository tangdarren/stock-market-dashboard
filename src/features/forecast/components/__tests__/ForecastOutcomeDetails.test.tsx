import { render, screen } from '@testing-library/react'
import { ForecastOutcomeDetails } from '../ForecastOutcomeDetails'
import type { ForecastHorizonOutcome } from '../../utils/forecastOutcomes'

const CORRECT: ForecastHorizonOutcome = {
  status: 'correct',
  isCurrent: false,
  realizedReturn: 0.0041,
  predicted: 1,
  actual: 1,
}

const INCORRECT: ForecastHorizonOutcome = {
  status: 'incorrect',
  isCurrent: false,
  realizedReturn: -0.0015,
  predicted: 1,
  actual: 0,
}

const CURRENT: ForecastHorizonOutcome = {
  status: 'unavailable',
  isCurrent: true,
  realizedReturn: null,
  predicted: null,
  actual: null,
}

describe('ForecastOutcomeDetails', () => {
  it('shows a correct directional score and realized return without implying performance', () => {
    render(<ForecastOutcomeDetails outcome={CORRECT} showDisclaimer />)
    expect(screen.getByText(/direction correct/i)).toBeInTheDocument()
    expect(screen.getByText('+0.41%')).toBeInTheDocument()
    expect(screen.getByText(/not proof of investment performance/i)).toBeInTheDocument()
    expect(screen.queryByText(/profit|alpha|beat the market/i)).not.toBeInTheDocument()
  })

  it('shows an incorrect directional score and realized return', () => {
    render(<ForecastOutcomeDetails outcome={INCORRECT} />)
    expect(screen.getByText(/direction incorrect/i)).toBeInTheDocument()
    expect(screen.getByText('-0.15%')).toBeInTheDocument()
    expect(screen.queryByText(/loss|failed trade/i)).not.toBeInTheDocument()
  })

  it('distinguishes the current forecast when no outcome is available yet', () => {
    render(<ForecastOutcomeDetails outcome={CURRENT} />)
    expect(
      screen.getByText(/current forecast — outcome not available yet/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/realized/i)).not.toBeInTheDocument()
  })
})
