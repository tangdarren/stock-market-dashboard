import { describe, expect, it } from 'vitest'
import {
  CONFIDENCE_GAP_DRIFT,
  CONFIDENCE_GAP_WATCH,
  confidenceOverconfidenceStatus,
  confidenceReliabilityExplanation,
  confidenceReliabilityKind,
  formatCompactDate,
  formatFeatureName,
  formatMetricScore,
  formatMonitorDate,
  formatPercentScore,
  formatSignedDelta,
  formatSignedPercentDelta,
  humanizeReasonCode,
  parseMonitoringHorizon,
  parseMonitoringWindow,
  statusGlyph,
  statusLabel,
  unavailableReasonMessage,
} from '../format'
import { cycleRadioOption } from '../radioGroup'
import { demoModelMonitoringWatch } from '../../demo/demoResponses'

// Local re-check of demo aggregation expectations without importing Python.
function demoWatchWouldAggregateToWatch(): boolean {
  const demo = demoModelMonitoringWatch()
  const latest = demo.latest_performance!
  const accuracyDrop = Math.max(0, -(latest.vs_baseline.accuracy ?? 0))
  const overconfidence = Math.max(0, demo.confidence_vs_accuracy!.gap)
  const featureStatuses =
    demo.feature_drift?.ranked.map((row) => row.status) ?? []
  const bands = [
    accuracyDrop >= CONFIDENCE_GAP_DRIFT
      ? 'drift_detected'
      : accuracyDrop >= CONFIDENCE_GAP_WATCH
        ? 'watch'
        : 'stable',
    overconfidence >= CONFIDENCE_GAP_DRIFT
      ? 'drift_detected'
      : overconfidence >= CONFIDENCE_GAP_WATCH
        ? 'watch'
        : 'stable',
    ...featureStatuses.filter((s) => s === 'watch' || s === 'drift_detected'),
  ]
  if (bands.includes('drift_detected')) return false
  return bands.includes('watch')
}

describe('model monitor format utils', () => {
  it('parses horizon and window query values with safe fallbacks', () => {
    expect(parseMonitoringHorizon('5d')).toBe('5d')
    expect(parseMonitoringHorizon('nope')).toBe('1d')
    expect(parseMonitoringWindow('120')).toBe(120)
    expect(parseMonitoringWindow('252')).toBe(252)
    expect(parseMonitoringWindow('45')).toBe(30)
  })

  it('formats scores, percentages, deltas, and dates consistently', () => {
    expect(formatMetricScore(0.1234)).toBe('0.123')
    expect(formatMetricScore(null)).toBe('—')
    expect(formatPercentScore(0.546)).toBe('54.6%')
    expect(formatPercentScore(null)).toBe('—')
    expect(formatSignedDelta(0.05)).toBe('+0.050')
    expect(formatSignedDelta(-0.02)).toBe('-0.020')
    expect(formatSignedPercentDelta(0.05)).toBe('+5.0 pp')
    expect(formatSignedPercentDelta(-0.025)).toBe('-2.5 pp')
    expect(formatSignedPercentDelta(null)).toBe('—')
    expect(formatMonitorDate('2025-06-15')).toBe('Jun 15, 2025')
    expect(formatMonitorDate(null)).toBe('—')
    expect(formatCompactDate('2025-06-15')).toBe('06/15')
    expect(formatFeatureName('rsi_14')).toBe('Rsi 14')
    expect(humanizeReasonCode('accuracy_drop_vs_baseline')).toBe(
      'Accuracy Drop Vs Baseline',
    )
  })

  it('maps status glyphs and unavailable reasons', () => {
    expect(statusLabel('drift_detected')).toBe('Drift detected')
    expect(statusGlyph('stable')).toBe('●')
    expect(statusGlyph('watch')).toBe('▲')
    expect(statusGlyph('drift_detected')).toBe('■')
    expect(unavailableReasonMessage('monitoring_reference_missing')).toMatch(
      /monitoring reference/i,
    )
    expect(unavailableReasonMessage('insufficient_observations')).toMatch(
      /not enough complete observations/i,
    )
  })

  it('aligns overconfidence boundaries with backend watch/drift bands', () => {
    expect(CONFIDENCE_GAP_WATCH).toBe(0.05)
    expect(CONFIDENCE_GAP_DRIFT).toBe(0.1)

    expect(confidenceOverconfidenceStatus(0.049999)).toBe('stable')
    expect(confidenceOverconfidenceStatus(0.05)).toBe('watch')
    expect(confidenceOverconfidenceStatus(0.099999)).toBe('watch')
    expect(confidenceOverconfidenceStatus(0.1)).toBe('drift_detected')
    expect(confidenceOverconfidenceStatus(-0.08)).toBe('stable')

    expect(confidenceReliabilityKind(0.05)).toBe('overconfident')
    expect(confidenceReliabilityKind(0.049)).toBe('well_calibrated')
    expect(confidenceReliabilityKind(-0.08)).toBe('underconfident')
    expect(confidenceReliabilityKind(0.01)).toBe('well_calibrated')

    expect(confidenceReliabilityExplanation(0.05, 0.58, 0.53)).toMatch(/overconfident/i)
    expect(confidenceReliabilityExplanation(0.05, 0.58, 0.53)).toMatch(
      /escalates on overconfidence/i,
    )
    expect(confidenceReliabilityExplanation(-0.08, 0.5, 0.58)).toMatch(/underconfidence/i)
    expect(confidenceReliabilityExplanation(-0.08, 0.5, 0.58)).toMatch(
      /descriptive only|context only/i,
    )
    expect(confidenceReliabilityExplanation(0.04, 0.58, 0.54)).toMatch(/aligned/i)
  })

  it('keeps the watch demo inside the watch aggregation band', () => {
    const demo = demoModelMonitoringWatch()
    expect(demo.status).toBe('watch')
    expect(demo.confidence_vs_accuracy?.status).toBe('watch')
    expect(demo.confidence_vs_accuracy?.gap).toBeLessThan(CONFIDENCE_GAP_DRIFT)
    expect(demo.confidence_vs_accuracy?.gap).toBeGreaterThanOrEqual(CONFIDENCE_GAP_WATCH)
    expect(demoWatchWouldAggregateToWatch()).toBe(true)
  })
})

describe('radioGroup helpers', () => {
  it('cycles options with arrow and home/end keys', () => {
    const options = ['1d', '5d'] as const
    expect(cycleRadioOption('ArrowRight', options, '1d')).toBe('5d')
    expect(cycleRadioOption('ArrowLeft', options, '1d')).toBe('5d')
    expect(cycleRadioOption('Home', options, '5d')).toBe('1d')
    expect(cycleRadioOption('End', options, '1d')).toBe('5d')
    expect(cycleRadioOption('Enter', options, '1d')).toBeNull()
  })
})
