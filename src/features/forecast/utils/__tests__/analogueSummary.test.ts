import type { AnalogueResponse } from '../../api/types'
import {
  buildAnalogueSummarySentence,
  formatPositiveShare,
  formatSignedPercent,
} from '../analogueSummary'

function base(overrides: Partial<AnalogueResponse> = {}): AnalogueResponse {
  return {
    available: true,
    symbol: 'SPY',
    query_date: '2024-06-14',
    features_as_of: '2024-06-14',
    data_as_of: '2024-06-14',
    limit: 5,
    methodology: {
      method: 'standardized_euclidean_nearest_neighbors',
      features: [],
      minimum_separation_days: 20,
    },
    summary: {
      analogue_count: 0,
      positive_after_1d_pct: null,
      positive_after_5d_pct: null,
      median_return_1d: null,
      median_return_5d: null,
      avg_return_1d: null,
      avg_return_5d: null,
    },
    analogues: [],
    disclaimer: 'Historical similarity does not imply the same future outcome.',
    mode: 'live',
    ...overrides,
  }
}

function analogue(direction_1d: 'up' | 'down', direction_5d: 'up' | 'down') {
  return {
    date: '2019-01-01',
    similarity: 70,
    distance: 0.5,
    close: 250,
    return_1d: direction_1d === 'up' ? 0.01 : -0.01,
    return_5d: direction_5d === 'up' ? 0.02 : -0.02,
    direction_1d,
    direction_5d,
    rsi_14: null,
    rolling_vol_20: null,
    distance_from_sma_20: null,
    relative_volume: null,
  }
}

describe('buildAnalogueSummarySentence', () => {
  it('reports counts derived directly from the analogue directions (mixed case)', () => {
    const sentence = buildAnalogueSummarySentence(
      base({
        analogues: [
          analogue('up', 'up'),
          analogue('up', 'down'),
          analogue('up', 'up'),
          analogue('down', 'down'),
          analogue('up', 'down'),
        ],
      }),
    )
    expect(sentence).toContain('Among the five closest historical matches')
    expect(sentence).toContain('four finished higher and one lower the next session')
    expect(sentence).toContain('two finished higher and three lower five sessions later')
  })

  it('says "all N finished higher/lower" when the split is unanimous', () => {
    const sentence = buildAnalogueSummarySentence(
      base({
        analogues: [analogue('up', 'up'), analogue('up', 'up'), analogue('up', 'up')],
      }),
    )
    expect(sentence).toContain('Among the three closest historical matches')
    expect(sentence).toContain('all three finished higher the next session')
    expect(sentence).toContain('all three finished higher five sessions later')
  })

  it('reports "no sufficiently close historical matches" when empty', () => {
    const sentence = buildAnalogueSummarySentence(base({ analogues: [] }))
    expect(sentence).toMatch(/no sufficiently close historical matches/i)
  })

  it('reports the unavailable state when available:false', () => {
    const sentence = buildAnalogueSummarySentence(base({ available: false }))
    expect(sentence).toMatch(/not available/i)
  })
})

describe('formatSignedPercent', () => {
  it('formats positive fractional returns with a + sign', () => {
    expect(formatSignedPercent(0.0123)).toBe('+1.23%')
  })
  it('formats negative fractional returns without an extra plus', () => {
    expect(formatSignedPercent(-0.0031)).toBe('-0.31%')
  })
  it('returns a dash for null', () => {
    expect(formatSignedPercent(null)).toBe('—')
  })
})

describe('formatPositiveShare', () => {
  it('renders count-of-N when the summary is populated', () => {
    const summary = {
      analogue_count: 5,
      positive_after_1d_pct: 60,
      positive_after_5d_pct: 40,
      median_return_1d: 0,
      median_return_5d: 0,
      avg_return_1d: 0,
      avg_return_5d: 0,
    }
    expect(formatPositiveShare(60, summary)).toBe('60% (3 of 5)')
    expect(formatPositiveShare(40, summary)).toBe('40% (2 of 5)')
  })
  it('returns a dash for missing values', () => {
    expect(formatPositiveShare(null, null)).toBe('—')
  })
})
