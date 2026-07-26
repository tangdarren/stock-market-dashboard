import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { ReplayLabPage } from '../ReplayLabPage'
import {
  demoReplayResult,
  demoReplaySession,
} from '@/features/replay/demo/demoResponses'
import {
  appendAttempt,
  parseHistory,
  REPLAY_HISTORY_STORAGE_KEY,
} from '@/features/replay/history'
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

  it('does not request the result endpoint on initial load', async () => {
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

  it('keeps the result endpoint idle while the prediction is editable and after lock', async () => {
    const resultSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/result`, () => {
        resultSpy()
        return HttpResponse.json(demoReplayResult)
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    expect(resultSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    await user.click(screen.getByLabelText(/confidence/i))
    // Range inputs need a change event to commit a value.
    fireConfidence(70)

    expect(screen.getByRole('button', { name: /lock prediction/i })).toBeEnabled()
    expect(resultSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /lock prediction/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/locked prediction summary/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /reveal outcome/i })).toBeInTheDocument()
    expect(resultSpy).not.toHaveBeenCalled()
  })

  it('requests the result endpoint only after Reveal outcome', async () => {
    const resultSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/result`, () => {
        resultSpy()
        return HttpResponse.json(demoReplayResult)
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: /five trading sessions/i }))
    await user.click(screen.getByRole('radio', { name: /^down$/i }))
    fireConfidence(70)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))

    expect(resultSpy).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /reveal outcome/i }))

    await waitFor(() => {
      expect(resultSpy).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/outcome comparison/i)).toBeInTheDocument()
    })
    const comparison = screen.getByLabelText(/outcome comparison/i)
    expect(comparison).toHaveTextContent(/your implied p\(up\)/i)
    expect(comparison).toHaveTextContent('30.0%')
    expect(comparison).toHaveTextContent(/model probability \(selected horizon\)/i)
    expect(comparison).toHaveTextContent(/you were correct/i)
    expect(comparison).toHaveTextContent(/model was correct/i)
    expect(comparison).toHaveTextContent(/out-of-sample walk-forward evaluation/i)
    expect(screen.getByText(/other horizon \(not scored this round\)/i)).toBeInTheDocument()
  })

  it('requires horizon, direction, and confidence before locking', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lock prediction/i })).toBeDisabled()
    })

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    expect(screen.getByRole('button', { name: /lock prediction/i })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    expect(screen.getByRole('button', { name: /lock prediction/i })).toBeDisabled()

    fireConfidence(55)
    expect(screen.getByRole('button', { name: /lock prediction/i })).toBeEnabled()
  })

  it('freezes prediction controls after lock and supports cancel before reveal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    fireConfidence(65)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))

    expect(screen.getByRole('radio', { name: /one trading session/i })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /^up$/i })).toBeDisabled()
    expect(screen.getByLabelText(/confidence/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /lock prediction/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancel lock/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lock prediction/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('radio', { name: /one trading session/i })).toBeEnabled()
  })

  it('resets prediction workflow when loading another session', async () => {
    const resultSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/result`, () => {
        resultSpy()
        return HttpResponse.json(demoReplayResult)
      }),
      http.get(`${base}/replay/spy/session`, ({ request }) => {
        const url = new URL(request.url)
        const date = url.searchParams.get('date')
        return HttpResponse.json({
          ...demoReplaySession,
          selected_date: date,
        })
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    fireConfidence(70)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))
    await user.click(screen.getByRole('button', { name: /reveal outcome/i }))

    await waitFor(() => {
      expect(resultSpy).toHaveBeenCalled()
    })

    const input = screen.getByLabelText(/historical date/i)
    await user.clear(input)
    await user.type(input, '2024-09-13')
    await user.click(screen.getByRole('button', { name: /load session/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /lock prediction/i })).toBeDisabled()
    })
    expect(screen.queryByRole('button', { name: /reveal outcome/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/outcome comparison/i)).not.toBeInTheDocument()

    const callsAfterReset = resultSpy.mock.calls.length
    await user.click(screen.getByRole('radio', { name: /five trading sessions/i }))
    await user.click(screen.getByRole('radio', { name: /^down$/i }))
    fireConfidence(80)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))
    expect(resultSpy).toHaveBeenCalledTimes(callsAfterReset)
  })

  it('keeps the locked prediction visible when the result request fails', async () => {
    server.use(
      http.get(`${base}/replay/spy/result`, () => HttpResponse.error()),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    fireConfidence(70)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))
    await user.click(screen.getByRole('button', { name: /reveal outcome/i }))

    await waitFor(() => {
      expect(screen.getByText(/could not load outcome/i)).toBeInTheDocument()
    })
    const lockedSummary = screen.getByLabelText(/locked prediction summary/i)
    expect(lockedSummary).toBeInTheDocument()
    expect(lockedSummary).toHaveTextContent(/implied p\(up\)/i)
    expect(lockedSummary).toHaveTextContent('70.0%')
  })

  it('records a completed attempt after reveal and does not duplicate it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: /your replay performance/i })).toBeInTheDocument()
    expect(screen.getByText(/no completed forecasts yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /one trading session/i }))
    await user.click(screen.getByRole('radio', { name: /^up$/i }))
    fireConfidence(70)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))
    await user.click(screen.getByRole('button', { name: /reveal outcome/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/outcome comparison/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/completed attempts/i).closest('div')).toHaveTextContent('1')
    })

    const stored = parseHistory(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY))
    expect(stored.attempts).toHaveLength(1)
    expect(stored.attempts[0]).toMatchObject({
      replayDate: demoReplaySession.selected_date,
      horizon: 1,
      userDirection: 'up',
      userConfidence: 70,
      userProbUp: 0.7,
    })

    // Same attempt id (rerender / repeated reveal response) must not double-count.
    const dup = appendAttempt(stored.attempts[0]!)
    expect(dup.status).toBe('duplicate')
    expect(parseHistory(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY)).attempts).toHaveLength(
      1,
    )
  })

  it('clears local history only after an accessible confirmation step', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('radio', { name: /five trading sessions/i }))
    await user.click(screen.getByRole('radio', { name: /^down$/i }))
    fireConfidence(70)
    await user.click(screen.getByRole('button', { name: /lock prediction/i }))
    await user.click(screen.getByRole('button', { name: /reveal outcome/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^clear history$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^clear history$/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/clear all local history/i)
    expect(
      screen.getByRole('button', { name: /confirm clear history/i }),
    ).toBeInTheDocument()

    // First step alone must not wipe storage.
    expect(parseHistory(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY)).attempts).toHaveLength(
      1,
    )

    await user.click(screen.getByRole('button', { name: /confirm clear history/i }))

    await waitFor(() => {
      expect(screen.getByText(/no completed forecasts yet/i)).toBeInTheDocument()
    })
    expect(parseHistory(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY)).attempts).toHaveLength(
      0,
    )
  })

  it('labels simulated replay sessions as fictional workbook data', async () => {
    window.localStorage.setItem('spy-forecast-lab:simulated-data', '1')
    renderWithProviders(<ReplayLabPage />)

    expect(
      await screen.findByRole('status', { name: /simulated workbook data/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/fictional scenario session/i),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })

    expect(
      screen.getByText(/not real SPY history/i),
    ).toBeInTheDocument()
  })

  it('keeps historical SPY framing in live mode', async () => {
    renderWithProviders(<ReplayLabPage />)

    expect(
      await screen.findByRole('heading', { name: /market replay lab/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: /simulated workbook data/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/historical SPY session/i),
    ).toBeInTheDocument()
  })
})

/** Commit a confidence value on the range input (user-event is awkward for ranges). */
function fireConfidence(value: number) {
  const input = screen.getByLabelText(/confidence/i) as HTMLInputElement
  act(() => {
    input.focus()
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeInputValueSetter?.call(input, String(value))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

