import {
  buildInterpretationSentence,
  computeHorizonOutlook,
} from '../interpretation'
import type { HorizonForecast } from '../../api/types'

function mkForecast(probUp: number, horizonDays = 1): HorizonForecast {
  return {
    horizon_days: horizonDays,
    prob_up: probUp,
    prob_down: 1 - probUp,
    direction: probUp >= 0.5 ? 'up' : 'down',
    confidence: probUp >= 0.65 || probUp <= 0.35 ? 'high' : probUp >= 0.55 || probUp <= 0.45 ? 'moderate' : 'low',
    model_name: 'test_model',
    trained_at: '2024-01-01T00:00:00Z',
    features_as_of: '2024-01-01',
    explanations: {
      method: 'logistic_regression_contribution',
      up: [],
      down: [],
      uncertainty: [],
    },
  }
}

describe('computeHorizonOutlook', () => {
  it('reports no strong directional edge when the peak probability is below 55%', () => {
    const outlook = computeHorizonOutlook(mkForecast(0.52))!
    expect(outlook.lean).toBe('neutral')
    expect(outlook.strength).toBe('none')
    expect(outlook.headline).toMatch(/no strong directional edge/i)
    expect(outlook.confidenceCopy).toMatch(/low confidence/i)
    expect(outlook.confidenceCopy).toMatch(/close to 50%/i)
  })

  it('reports a moderate upward lean between 55% and 65%', () => {
    const outlook = computeHorizonOutlook(mkForecast(0.58))!
    expect(outlook.lean).toBe('up')
    expect(outlook.strength).toBe('moderate')
    expect(outlook.headline).toBe('Model leans upward')
    expect(outlook.confidenceCopy).toMatch(/moderate confidence/i)
    expect(outlook.confidenceCopy).toContain('58.0%')
  })

  it('reports a moderate downward lean between 35% and 45%', () => {
    const outlook = computeHorizonOutlook(mkForecast(0.4))!
    expect(outlook.lean).toBe('down')
    expect(outlook.strength).toBe('moderate')
    expect(outlook.headline).toBe('Model leans downward')
    expect(outlook.confidenceCopy).toMatch(/60\.0%/)
  })

  it('reports a strong lean when the peak probability meets or exceeds 65%', () => {
    const outlook = computeHorizonOutlook(mkForecast(0.72))!
    expect(outlook.strength).toBe('strong')
    expect(outlook.headline).toMatch(/strongly upward/i)
  })

  it('returns null for missing input', () => {
    expect(computeHorizonOutlook(null)).toBeNull()
    expect(computeHorizonOutlook(undefined)).toBeNull()
  })
})

describe('buildInterpretationSentence', () => {
  it('says both are neutral when both peaks are below 55%', () => {
    const one = computeHorizonOutlook(mkForecast(0.51, 1))
    const five = computeHorizonOutlook(mkForecast(0.53, 5))
    expect(buildInterpretationSentence(one, five)).toMatch(
      /no strong one-day or five-session/i,
    )
  })

  it('combines a leaning 1-day and neutral 5-day into one sentence', () => {
    const one = computeHorizonOutlook(mkForecast(0.62, 1))
    const five = computeHorizonOutlook(mkForecast(0.52, 5))
    const s = buildInterpretationSentence(one, five)
    expect(s).toMatch(/slightly upward/i)
    expect(s).toMatch(/no strong five-session/i)
    expect(s).toContain('62.0%')
  })

  it('combines a neutral 1-day and leaning 5-day into one sentence', () => {
    const one = computeHorizonOutlook(mkForecast(0.5, 1))
    const five = computeHorizonOutlook(mkForecast(0.68, 5))
    const s = buildInterpretationSentence(one, five)
    expect(s).toMatch(/no strong one-day/i)
    expect(s).toMatch(/strongly upward/i)
    expect(s).toContain('68.0%')
  })

  it('handles both horizons leaning', () => {
    const one = computeHorizonOutlook(mkForecast(0.58, 1))
    const five = computeHorizonOutlook(mkForecast(0.6, 5))
    const s = buildInterpretationSentence(one, five)
    expect(s).toMatch(/slightly upward lean over the next trading day/i)
    expect(s).toMatch(/slightly upward lean over the next five sessions/i)
  })

  it('handles missing horizons gracefully', () => {
    expect(buildInterpretationSentence(null, null)).toMatch(
      /no forecast to interpret/i,
    )
    const only1 = computeHorizonOutlook(mkForecast(0.6, 1))
    expect(buildInterpretationSentence(only1, null)).toMatch(
      /over the next trading day/i,
    )
  })
})
