import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistoricalAnaloguesPanel } from '../HistoricalAnaloguesPanel'
import { AnalogueValidationError } from '../../api/analogueSchema'
import type { AnalogueResponse } from '../../api/types'
import { BackendUnavailableError } from '@/lib/api/client'

const BASE_RESPONSE: AnalogueResponse = {
  available: true,
  symbol: 'SPY',
  query_date: '2024-06-14',
  features_as_of: '2024-06-14',
  data_as_of: '2024-06-14',
  limit: 5,
  methodology: {
    method: 'standardized_euclidean_nearest_neighbors',
    features: ['return_1d_lag', 'rsi_14', 'macd'],
    minimum_separation_days: 20,
    candidate_pool_size: 512,
  },
  summary: {
    analogue_count: 5,
    positive_after_1d_pct: 60,
    positive_after_5d_pct: 40,
    median_return_1d: 0.0015,
    median_return_5d: -0.0031,
    avg_return_1d: 0.0022,
    avg_return_5d: -0.0018,
  },
  analogues: [
    {
      date: '2019-03-12',
      similarity: 82.4,
      distance: 0.58,
      close: 279.15,
      return_1d: 0.006,
      return_5d: 0.021,
      direction_1d: 'up',
      direction_5d: 'up',
      rsi_14: 63.2,
      rolling_vol_20: 0.0091,
      distance_from_sma_20: 0.014,
      relative_volume: 0.87,
    },
    {
      date: '2017-08-04',
      similarity: 78.1,
      distance: 0.72,
      close: 247.41,
      return_1d: 0.003,
      return_5d: -0.005,
      direction_1d: 'up',
      direction_5d: 'down',
      rsi_14: 58.6,
      rolling_vol_20: 0.0074,
      distance_from_sma_20: 0.009,
      relative_volume: 0.71,
    },
    {
      date: '2015-11-04',
      similarity: 74.5,
      distance: 0.83,
      close: 210.36,
      return_1d: -0.004,
      return_5d: -0.011,
      direction_1d: 'down',
      direction_5d: 'down',
      rsi_14: 55.9,
      rolling_vol_20: 0.0088,
      distance_from_sma_20: 0.006,
      relative_volume: 0.94,
    },
    {
      date: '2013-09-19',
      similarity: 71.2,
      distance: 0.91,
      close: 173.05,
      return_1d: 0.001,
      return_5d: 0.004,
      direction_1d: 'up',
      direction_5d: 'up',
      rsi_14: 61.4,
      rolling_vol_20: 0.0067,
      distance_from_sma_20: 0.011,
      relative_volume: 0.82,
    },
    {
      date: '2011-04-27',
      similarity: 67.8,
      distance: 1.02,
      close: 136.42,
      return_1d: 0.004,
      return_5d: -0.008,
      direction_1d: 'up',
      direction_5d: 'down',
      rsi_14: 66.1,
      rolling_vol_20: 0.0102,
      distance_from_sma_20: 0.018,
      relative_volume: 1.05,
    },
  ],
  disclaimer:
    'Historical similarity does not imply the same future outcome. Analogues describe past market environments, not a prediction.',
  mode: 'live',
  cache_status: 'miss',
}

describe('HistoricalAnaloguesPanel', () => {
  it('renders the deterministic aggregate summary sentence derived from the response', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    const summary = screen.getByTestId('historical-analogues-summary')
    // 4 of 5 analogues have direction_1d === 'up', 2 have direction_5d === 'up'.
    expect(summary).toHaveTextContent(/Among the five closest historical matches/i)
    expect(summary).toHaveTextContent(/four finished higher and one lower the next session/i)
    expect(summary).toHaveTextContent(/two finished higher and three lower five sessions later/i)
  })

  it('shows each analogue date and its similarity score', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    // Every analogue is exposed as an <article> whose heading references the
    // raw ISO date via `aria-labelledby="analogue-<date>-heading"`. Assert on
    // that stable ID rather than the locale-formatted display string.
    for (const record of BASE_RESPONSE.analogues) {
      expect(document.getElementById(`analogue-${record.date}-heading`)).not.toBeNull()
    }
    // Similarity pills render "NN.N / 100" — one per analogue.
    expect(screen.getAllByText(/\/100/).length).toBe(BASE_RESPONSE.analogues.length)
    // 82.4 appears both in the pill and inside the collapsed <details>; the
    // important thing is that the similarity score is rendered as visible text
    // AT LEAST once per analogue.
    expect(screen.getAllByText(/82\.4/).length).toBeGreaterThanOrEqual(1)

    // Each analogue exposes an accessible similarity label with the numeric value.
    expect(
      screen.getByRole('group', { name: /similarity 82\.4 out of 100/i }),
    ).toBeInTheDocument()
  })

  it('renders one-day and five-day outcome direction with icon AND text', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    const upList = screen.getAllByLabelText('Direction: up')
    const downList = screen.getAllByLabelText('Direction: down')
    // Every analogue renders both a 1d and a 5d outcome (10 total icons for 5 records).
    expect(upList.length + downList.length).toBe(BASE_RESPONSE.analogues.length * 2)
    // Text labels are present too (not just color).
    expect(screen.getAllByText(/Higher|Lower/).length).toBeGreaterThan(0)
  })

  it('keeps the disclaimer sentence visible', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    expect(
      screen.getByText(/Historical similarity does not imply the same future outcome/i),
    ).toBeInTheDocument()
  })

  it('never renders BUY or SELL trade-signal language', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    // Whole-word check so "buyback" / "seller" etc. never falsely trigger.
    expect(document.body.textContent ?? '').not.toMatch(/\bBUY\b/)
    expect(document.body.textContent ?? '').not.toMatch(/\bSELL\b/)
    expect(document.body.textContent ?? '').not.toMatch(/\bHOLD\b/)
  })

  it('exposes accessible expandable "Why this day matched" details for each analogue', async () => {
    const user = userEvent.setup()
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    const summaries = screen.getAllByText(/Why this day matched/i)
    expect(summaries.length).toBe(BASE_RESPONSE.analogues.length)

    // Semantic <details>/<summary>: keyboard/click both work and toggle open state.
    const first = summaries[0]
    const details = first.closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    await user.click(first)
    expect(details.open).toBe(true)
    // The expanded body contains restrained metadata, not a wall of every metric.
    expect(
      within(details).getByText(/Close price/i),
    ).toBeInTheDocument()
    expect(within(details).getByText(/Descriptive only — not a prediction/i)).toBeInTheDocument()
  })

  it('presents analogue records as a list (renders as stacked records on mobile)', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    const list = screen.getByRole('list', { name: /historical analogue sessions/i })
    expect(list).toBeInTheDocument()
    // Grid classes place the items in a single column on mobile and 2 columns md+.
    expect(list.className).toMatch(/grid-cols-1/)
    expect(list.className).toMatch(/md:grid-cols-2/)
    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBe(BASE_RESPONSE.analogues.length)
  })

  it('shows an accessible descriptive loading state', () => {
    render(<HistoricalAnaloguesPanel isLoading />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(
      within(status).getByText(/Loading historical analogue sessions/i),
    ).toBeInTheDocument()
  })

  it('renders a truthful unavailable panel when the endpoint reports available:false', () => {
    render(
      <HistoricalAnaloguesPanel
        data={{
          ...BASE_RESPONSE,
          available: false,
          summary: null,
          analogues: [],
          reason: 'historical_dataset_missing',
          detail: 'Historical dataset is not present.',
          mode: 'unavailable',
        }}
      />,
    )
    expect(screen.getByText(/aren't available for this session/i)).toBeInTheDocument()
    expect(
      screen.getByText(/local historical SPY dataset has not been bootstrapped/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Historical similarity does not imply the same future outcome/i),
    ).toBeInTheDocument()
  })

  it('renders a truthful error panel when the fetch failed (backend unavailable)', () => {
    render(
      <HistoricalAnaloguesPanel error={new BackendUnavailableError('backend down')} />,
    )
    expect(screen.getByText(/aren't available\./i)).toBeInTheDocument()
    expect(
      screen.getByText(/backend cannot be reached right now/i),
    ).toBeInTheDocument()
  })

  it('renders a validation-error panel when the schema check fails', () => {
    render(
      <HistoricalAnaloguesPanel
        error={new AnalogueValidationError('summary.analogue_count is missing')}
      />,
    )
    expect(
      screen.getByText(/returned in an unexpected shape/i),
    ).toBeInTheDocument()
  })

  it('shows a demo-data badge and never claims the data is live when isDemo=true', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} isDemo />)
    expect(screen.getByText(/Demo data — sample analogues/i)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/\bLive\b/)
  })

  it('shows a stale-cache pill when the response mode is stale', () => {
    render(
      <HistoricalAnaloguesPanel data={{ ...BASE_RESPONSE, mode: 'stale' }} />,
    )
    expect(screen.getByText(/Stale cache/i)).toBeInTheDocument()
  })

  it('labels each card as a "Historical match" rather than as a prediction or trade signal', () => {
    render(<HistoricalAnaloguesPanel data={BASE_RESPONSE} />)
    for (const card of screen.getAllByRole('article')) {
      // Positive assertion: eyebrow copy is explicitly a "Historical match".
      expect(within(card).getByText(/Historical match/i)).toBeInTheDocument()
      // Negative assertions: no directive-forecast language ("will rise",
      // "expect", "predicts", "trade signal") anywhere inside the card.
      const cardText = card.textContent ?? ''
      expect(cardText).not.toMatch(/will (rise|fall|go up|go down)/i)
      expect(cardText).not.toMatch(/\b(expected to|expects to|predicts)\b/i)
      expect(cardText).not.toMatch(/\btrade signal\b/i)
    }
  })
})
