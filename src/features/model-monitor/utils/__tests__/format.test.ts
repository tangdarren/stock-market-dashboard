import { describe, expect, it } from 'vitest'
import {
  formatMetricScore,
  formatSignedDelta,
  parseMonitoringHorizon,
  parseMonitoringWindow,
  statusLabel,
  unavailableReasonMessage,
} from '../format'

describe('model monitor format utils', () => {
  it('parses horizon and window query values with safe fallbacks', () => {
    expect(parseMonitoringHorizon('5d')).toBe('5d')
    expect(parseMonitoringHorizon('nope')).toBe('1d')
    expect(parseMonitoringWindow('120')).toBe(120)
    expect(parseMonitoringWindow('45')).toBe(30)
  })

  it('formats scores and deltas', () => {
    expect(formatMetricScore(0.1234)).toBe('0.123')
    expect(formatMetricScore(null)).toBe('—')
    expect(formatSignedDelta(0.05)).toBe('+0.050')
    expect(formatSignedDelta(-0.02)).toBe('-0.020')
  })

  it('maps status and unavailable reasons', () => {
    expect(statusLabel('drift_detected')).toBe('Drift detected')
    expect(unavailableReasonMessage('monitoring_reference_missing')).toMatch(
      /monitoring reference/i,
    )
  })
})
