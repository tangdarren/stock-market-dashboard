import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ReplayLabPage } from '../ReplayLabPage'
import { demoReplaySession } from '@/features/replay/demo/demoResponses'
import { ENV } from '@/lib/api/env'
import { renderWithProviders } from '@/test/renderPage'
import { server } from '@/test/msw/server'

const base = `${ENV.API_BASE_URL}${ENV.API_PREFIX}`

describe('ReplayLabPage', () => {
  it('loads a random session on mount and shows selected-date info', async () => {
    renderWithProviders(<ReplayLabPage />)

    expect(screen.getByRole('heading', { name: /market replay lab/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /random session/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /load session/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue(demoReplaySession.selected_date!)).toBeInTheDocument()
    expect(screen.getByText(/eligible range/i)).toBeInTheDocument()
    expect(screen.getAllByText(demoReplaySession.min_eligible_date!).length).toBeGreaterThan(0)
    expect(screen.getAllByText(demoReplaySession.max_eligible_date!).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_, element) => {
        const text = element?.textContent ?? ''
        return (
          element?.tagName === 'P' &&
          /data available through/i.test(text) &&
          text.includes(demoReplaySession.selected_date!)
        )
      }).length,
    ).toBeGreaterThan(0)
  })

  it('renders the historical chart ending on the selected date with an accessible summary', async () => {
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /historical closing price/i })).toBeInTheDocument()
    })

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/completed sessions/i)
    expect(note).toHaveTextContent(demoReplaySession.selected_date!)
    expect(note).toHaveTextContent(/no sessions after/i)
    expect(
      screen.getByText(
        new RegExp(`${demoReplaySession.session_count} completed sessions through`, 'i'),
      ),
    ).toBeInTheDocument()
  })

  it('renders market-condition cards from session indicators', async () => {
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /market conditions/i })).toBeInTheDocument()
    })

    const panel = screen.getByRole('region', { name: /market conditions as of selected date/i })
    expect(panel).toHaveTextContent(/closing price/i)
    expect(panel).toHaveTextContent(/momentum \(5d\)/i)
    expect(panel).toHaveTextContent(/rsi \(14\)/i)
    expect(panel).toHaveTextContent(/rolling vol \(20d\)/i)
    expect(panel).toHaveTextContent(/vs 20-day sma/i)
    expect(panel).toHaveTextContent(/relative volume/i)
    expect(panel).toHaveTextContent(/opening gap/i)
  })

  it('shows nearby eligible dates when the backend rejects a date', async () => {
    server.use(
      http.get(`${base}/replay/spy/session`, () =>
        HttpResponse.json({
          ...demoReplaySession,
          available: false,
          mode: 'unavailable',
          selected_date: '2024-01-05',
          series: [],
          session_count: 0,
          indicators: null,
          reason: 'weekend',
          detail: '2024-01-06 falls on a weekend; SPY does not trade.',
          nearest_eligible_before: '2024-01-05',
          nearest_eligible_after: '2024-01-08',
        }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue(demoReplaySession.selected_date!)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/historical date/i)
    await user.clear(input)
    await user.type(input, '2024-01-05')
    await user.click(screen.getByRole('button', { name: /load session/i }))

    await waitFor(() => {
      expect(screen.getByText(/weekend date/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /before: 2024-01-05/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /after: 2024-01-08/i })).toBeInTheDocument()
  })

  it('loads a nearby eligible date when a suggestion is clicked', async () => {
    server.use(
      http.get(`${base}/replay/spy/session`, ({ request }) => {
        const url = new URL(request.url)
        const date = url.searchParams.get('date')
        if (date === '2024-01-06') {
          return HttpResponse.json({
            ...demoReplaySession,
            available: false,
            mode: 'unavailable',
            selected_date: date,
            series: [],
            session_count: 0,
            indicators: null,
            reason: 'weekend',
            detail: 'Weekend.',
            nearest_eligible_before: '2024-01-05',
            nearest_eligible_after: '2024-01-08',
          })
        }
        return HttpResponse.json({
          ...demoReplaySession,
          selected_date: date,
          series: demoReplaySession.series.map((bar, index, arr) =>
            index === arr.length - 1 ? { ...bar, date: date ?? bar.date } : bar,
          ),
        })
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue(demoReplaySession.selected_date!)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/historical date/i)
    await user.clear(input)
    await user.type(input, '2024-01-06')
    await user.click(screen.getByRole('button', { name: /load session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /after: 2024-01-08/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /after: 2024-01-08/i }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('2024-01-08')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
  })

  it('shows a backend-unavailable state when the API is down', async () => {
    server.use(
      http.get(`${base}/replay/spy/random`, () => HttpResponse.error()),
      http.get(`${base}/replay/spy/session`, () => HttpResponse.error()),
    )

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument()
    })
  })

  it('does not request the result endpoint automatically', async () => {
    const resultSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/result`, () => {
        resultSpy()
        return HttpResponse.json({ available: false })
      }),
    )

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })

    expect(resultSpy).not.toHaveBeenCalled()
  })
})
