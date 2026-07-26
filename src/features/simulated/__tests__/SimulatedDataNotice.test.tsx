import { render, screen } from '@testing-library/react'
import {
  SimulatedDataNotice,
  SIMULATED_NOTICE_BODY,
  SIMULATED_NOTICE_TITLE,
} from '../SimulatedDataNotice'

describe('SimulatedDataNotice', () => {
  it('renders the default title and body', () => {
    render(<SimulatedDataNotice />)
    expect(screen.getByRole('status', { name: SIMULATED_NOTICE_TITLE })).toBeInTheDocument()
    expect(screen.getByText(SIMULATED_NOTICE_TITLE)).toBeInTheDocument()
    expect(screen.getByText(SIMULATED_NOTICE_BODY)).toBeInTheDocument()
  })

  it('prefers an explicit API disclaimer when provided', () => {
    render(<SimulatedDataNotice detail="Custom workbook disclaimer." />)
    expect(screen.getByText('Custom workbook disclaimer.')).toBeInTheDocument()
    expect(screen.queryByText(SIMULATED_NOTICE_BODY)).not.toBeInTheDocument()
  })
})
