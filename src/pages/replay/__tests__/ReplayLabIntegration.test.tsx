import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  demoReplayResult,
  demoReplaySession,
} from '@/features/replay/demo/demoResponses'
import {
  REPLAY_HISTORY_SCHEMA_VERSION,
  REPLAY_HISTORY_STORAGE_KEY,
  type ReplayAttempt,
} from '@/features/replay/history'
import { brierScore } from '@/features/replay/history/scoring'
import { ENV } from '@/lib/api/env'
import { ROUTES } from '@/lib/constants/routes'
import { renderReplayRoute, renderWithProviders } from '@/test/renderPage'
import { server } from '@/test/msw/server'
import { ReplayLabPage } from '../ReplayLabPage'

const base = `${ENV.API_BASE_URL}${ENV.API_PREFIX}`

function sampleStoredAttempt(overrides: Partial<ReplayAttempt> = {}): ReplayAttempt {
  return {
    id: 'stored-1',
    replayDate: '2024-08-01',
    horizon: 1,
    userDirection: 'up',
    userConfidence: 80,
    userProbUp: 0.8,
    modelProbUp: 0.6,
    modelDirection: 'up',
    actualDirection: 'up',
    realizedReturn: 0.01,
    userCorrect: true,
    modelCorrect: true,
    brierScore: brierScore(0.8, 'up'),
    completedAt: '2024-08-01T18:00:00.000Z',
    ...overrides,
  }
}

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

async function completeRound(user: ReturnType<typeof userEvent.setup>, opts?: {
  horizon?: RegExp
  direction?: RegExp
  confidence?: number
}) {
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /your prediction/i })).toBeInTheDocument()
  })
  await user.click(screen.getByRole('radio', { name: opts?.horizon ?? /one trading session/i }))
  await user.click(screen.getByRole('radio', { name: opts?.direction ?? /^up$/i }))
  fireConfidence(opts?.confidence ?? 70)
  await user.click(screen.getByRole('button', { name: /lock prediction/i }))
  await user.click(screen.getByRole('button', { name: /reveal outcome/i }))
  await waitFor(() => {
    expect(screen.getByLabelText(/outcome comparison/i)).toBeInTheDocument()
  })
}

describe('Market Replay Lab integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('mounts the /replay route with navigation marking Replay Lab current', async () => {
    renderReplayRoute([ROUTES.REPLAY])

    expect(screen.getByRole('heading', { name: /market replay lab/i })).toBeInTheDocument()
    const replayLinks = screen.getAllByRole('link', { name: /replay lab/i })
    expect(replayLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
    expect(replayLinks.some((link) => link.getAttribute('href') === ROUTES.REPLAY)).toBe(true)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })
  })

  it('requests a random session on initial load and not the result endpoint', async () => {
    const randomSpy = vi.fn()
    const resultSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/random`, () => {
        randomSpy()
        return HttpResponse.json(demoReplaySession)
      }),
      http.get(`${base}/replay/spy/result`, () => {
        resultSpy()
        return HttpResponse.json(demoReplayResult)
      }),
    )

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(randomSpy).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })
    expect(resultSpy).not.toHaveBeenCalled()
  })

  it('loads a session for a manually selected date', async () => {
    const sessionSpy = vi.fn()
    server.use(
      http.get(`${base}/replay/spy/session`, ({ request }) => {
        const date = new URL(request.url).searchParams.get('date')
        sessionSpy(date)
        return HttpResponse.json({
          ...demoReplaySession,
          selected_date: date,
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
    await user.type(input, '2024-09-13')
    await user.click(screen.getByRole('button', { name: /load session/i }))

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledWith('2024-09-13')
    })
    expect(screen.getByDisplayValue('2024-09-13')).toBeInTheDocument()
  })

  it('labels the historical date control once a session value is available', async () => {
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue(demoReplaySession.selected_date!)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/historical date/i)).toHaveAttribute('type', 'date')
    expect(screen.getByRole('button', { name: /load session/i })).toBeEnabled()
  })

  it('exposes accessible names for workflow, prediction, and empty history states', async () => {
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^selected session$/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('navigation', { name: /prediction workflow/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/configure your prediction/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /your replay performance/i })).toBeInTheDocument()
    expect(screen.getByText(/no completed forecasts yet/i)).toBeInTheDocument()
  })

  it('supports keyboard selection inside prediction radiogroups', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /one trading session/i })).toBeInTheDocument()
    })

    const oneSession = screen.getByRole('radio', { name: /one trading session/i })
    await user.click(oneSession)
    oneSession.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /five trading sessions/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    const up = screen.getByRole('radio', { name: /^up$/i })
    await user.click(up)
    up.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /^down$/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('restores existing local history into accuracy, Brier, and streak summaries', async () => {
    const attempts = [
      sampleStoredAttempt({
        id: 'a1',
        userCorrect: true,
        modelCorrect: false,
        brierScore: 0.04,
        completedAt: '2024-01-01T00:00:00.000Z',
      }),
      sampleStoredAttempt({
        id: 'a2',
        userCorrect: true,
        modelCorrect: true,
        userConfidence: 60,
        userProbUp: 0.6,
        brierScore: 0.16,
        completedAt: '2024-01-02T00:00:00.000Z',
      }),
    ]
    window.localStorage.setItem(
      REPLAY_HISTORY_STORAGE_KEY,
      JSON.stringify({ version: REPLAY_HISTORY_SCHEMA_VERSION, attempts }),
    )

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your replay performance/i })).toBeInTheDocument()
    })

    const panel = screen.getByRole('heading', { name: /your replay performance/i }).closest('section')
    expect(panel).not.toBeNull()
    const stats = within(panel as HTMLElement)
    expect(stats.getByText(/completed attempts/i).closest('div')).toHaveTextContent('2')
    expect(stats.getByText(/your directional accuracy/i).closest('div')).toHaveTextContent('100.0%')
    expect(stats.getByText(/model directional accuracy/i).closest('div')).toHaveTextContent('50.0%')
    expect(stats.getByText(/average brier score/i).closest('div')).toHaveTextContent('0.100')
    expect(stats.getByText(/lower is better/i)).toBeInTheDocument()
    expect(stats.getByText(/current streak/i).closest('div')).toHaveTextContent('2')
    expect(stats.getByText(/best streak/i).closest('div')).toHaveTextContent('2')
    expect(screen.getAllByText(/2024-08-01/).length).toBeGreaterThan(0)
  })

  it('recovers from malformed local storage without crashing', async () => {
    window.localStorage.setItem(REPLAY_HISTORY_STORAGE_KEY, '{not-valid-json')

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your replay performance/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/no completed forecasts yet/i)).toBeInTheDocument()
    expect(screen.getByText(/completed attempts/i).closest('div')).toHaveTextContent('0')
  })

  it('saves exactly one history attempt per completed round and updates summaries', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await completeRound(user, {
      horizon: /one trading session/i,
      direction: /^up$/i,
      confidence: 70,
    })

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY) ?? '{}')
      expect(stored.attempts).toHaveLength(1)
    })

    const panel = screen.getByRole('heading', { name: /your replay performance/i }).closest('section')
    expect(panel).not.toBeNull()
    const stats = within(panel as HTMLElement)
    // Demo 1d actual is down, so up@70 is incorrect; Brier = (0.7-0)^2 = 0.49
    expect(stats.getByText(/completed attempts/i).closest('div')).toHaveTextContent('1')
    expect(stats.getByText(/your directional accuracy/i).closest('div')).toHaveTextContent('0.0%')
    expect(stats.getByText(/average brier score/i).closest('div')).toHaveTextContent('0.490')
    expect(stats.getAllByText('Incorrect').length).toBeGreaterThan(0)

    const before = JSON.parse(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY) ?? '{}')
    expect(before.attempts).toHaveLength(1)

    cleanup()

    // Remount should restore the same single attempt, not create another.
    renderWithProviders(<ReplayLabPage />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /your replay performance/i })).toBeInTheDocument()
    })
    const after = JSON.parse(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY) ?? '{}')
    expect(after.attempts).toHaveLength(1)
    expect(screen.getByText(/completed attempts/i).closest('div')).toHaveTextContent('1')
  })

  it('cancels clear-history confirmation with Escape and confirms with the accessible action', async () => {
    window.localStorage.setItem(
      REPLAY_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: REPLAY_HISTORY_SCHEMA_VERSION,
        attempts: [sampleStoredAttempt()],
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^clear history$/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^clear history$/i }))
    const confirmStatus = screen.getByText(/clear all local history/i)
    expect(confirmStatus).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /confirm clear history/i })).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /confirm clear history/i })).not.toBeInTheDocument()
    })
    expect(JSON.parse(window.localStorage.getItem(REPLAY_HISTORY_STORAGE_KEY) ?? '{}').attempts).toHaveLength(
      1,
    )

    await user.click(screen.getByRole('button', { name: /^clear history$/i }))
    await user.click(screen.getByRole('button', { name: /confirm clear history/i }))
    await waitFor(() => {
      expect(screen.getByText(/no completed forecasts yet/i)).toBeInTheDocument()
    })
  })

  it('keeps mobile card list and desktop table markup for recent history', async () => {
    window.localStorage.setItem(
      REPLAY_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: REPLAY_HISTORY_SCHEMA_VERSION,
        attempts: [sampleStoredAttempt()],
      }),
    )

    renderWithProviders(<ReplayLabPage />)

    await waitFor(() => {
      expect(screen.getByLabelText(/recent replay attempts/i)).toBeInTheDocument()
    })
    const mobileList = screen.getByLabelText(/recent replay attempts/i)
    expect(mobileList.className).toMatch(/md:hidden/)

    const table = screen.getByRole('table', { name: /recent completed replay attempts/i })
    expect(table.closest('div')?.className ?? '').toMatch(/hidden/)
    expect(table.closest('div')?.className ?? '').toMatch(/md:block/)
  })

  it('marks reveal animation and fade wrappers as reduced-motion aware', async () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))

    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await completeRound(user)

    const comparison = screen.getByLabelText(/outcome comparison/i)
    expect(comparison.className).toMatch(/animate-replay-reveal/)
    expect(document.querySelector('[data-reduced-motion="true"]')).not.toBeNull()

    window.matchMedia = originalMatchMedia
  })

  it('compares user and model directions after reveal', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReplayLabPage />)

    await completeRound(user, {
      horizon: /five trading sessions/i,
      direction: /^down$/i,
      confidence: 70,
    })

    const comparison = screen.getByLabelText(/outcome comparison/i)
    expect(comparison).toHaveTextContent(/your direction/i)
    expect(comparison).toHaveTextContent(/model direction/i)
    expect(comparison).toHaveTextContent(/actual direction/i)
    expect(comparison).toHaveTextContent(/you were correct/i)
    expect(comparison).toHaveTextContent(/model was correct/i)
    expect(comparison).toHaveTextContent(/30\.0%/)
    expect(comparison).toHaveTextContent(/out-of-sample walk-forward evaluation/i)
  })
})
