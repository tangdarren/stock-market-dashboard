import { describe, expect, it } from 'vitest'
import {
  EMPTY_PREDICTION_DRAFT,
  impliedProbUp,
  isPredictionComplete,
  lockPrediction,
} from '../prediction'

describe('impliedProbUp', () => {
  it('maps up confidence directly to p(up)', () => {
    expect(impliedProbUp('up', 70)).toBe(0.7)
    expect(impliedProbUp('up', 50)).toBe(0.5)
    expect(impliedProbUp('up', 100)).toBe(1)
  })

  it('maps down confidence to the complementary p(up)', () => {
    expect(impliedProbUp('down', 70)).toBeCloseTo(0.3)
    expect(impliedProbUp('down', 50)).toBe(0.5)
    expect(impliedProbUp('down', 100)).toBe(0)
  })
})

describe('lockPrediction', () => {
  it('returns null until horizon, direction, and confidence are set', () => {
    expect(lockPrediction(EMPTY_PREDICTION_DRAFT)).toBeNull()
    expect(
      lockPrediction({ horizon: 1, direction: null, confidence: 70 }),
    ).toBeNull()
    expect(
      lockPrediction({ horizon: 1, direction: 'up', confidence: null }),
    ).toBeNull()
  })

  it('locks a complete draft with implied p(up)', () => {
    expect(
      lockPrediction({ horizon: 5, direction: 'down', confidence: 70 }),
    ).toEqual({
      horizon: 5,
      direction: 'down',
      confidence: 70,
      probUp: 0.3,
    })
  })
})

describe('isPredictionComplete', () => {
  it('requires all three fields', () => {
    expect(
      isPredictionComplete({ horizon: 1, direction: 'up', confidence: 60 }),
    ).toBe(true)
    expect(
      isPredictionComplete({ horizon: null, direction: 'up', confidence: 60 }),
    ).toBe(false)
  })
})
