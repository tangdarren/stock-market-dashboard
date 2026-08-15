import {
  compareSessionIndicators,
  indicatorsAtDate,
  rsi,
  tailReturn,
} from '../marketIndicators'
import type { SpyBar } from '../../api/types'

function buildSeries(startIso: string, closes: number[]): SpyBar[] {
  const start = new Date(`${startIso}T00:00:00Z`)
  return closes.map((close, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return {
      date: d.toISOString().slice(0, 10),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 50_000_000 + i * 100_000,
    }
  })
}

describe('indicatorsAtDate', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.4)
  const series = buildSeries('2024-08-01', closes)

  it('returns null for missing series or date', () => {
    expect(indicatorsAtDate(null, '2024-08-20')).toBeNull()
    expect(indicatorsAtDate(series, null)).toBeNull()
  })

  it('computes RSI, returns, SMA distance, vol, and relative volume as of a date', () => {
    const asOf = series[series.length - 1]!.date
    const snap = indicatorsAtDate(series, asOf)!
    expect(snap.asOf).toBe(asOf)
    expect(snap.rsi14).not.toBeNull()
    expect(snap.return1d).not.toBeNull()
    expect(snap.return5d).not.toBeNull()
    expect(snap.distanceFromSma20Pct).not.toBeNull()
    expect(snap.rollingVol20).not.toBeNull()
    expect(snap.relativeVolume).not.toBeNull()
    // Steadily rising closes → RSI should be elevated.
    expect(snap.rsi14!).toBeGreaterThan(60)
  })

  it('truncates the series so later bars do not leak into earlier snapshots', () => {
    const early = series[20]!.date
    const late = series[series.length - 1]!.date
    const earlySnap = indicatorsAtDate(series, early)!
    const lateSnap = indicatorsAtDate(series, late)!
    expect(earlySnap.close).toBe(series[20]!.close)
    expect(lateSnap.close).toBe(series[series.length - 1]!.close)
    expect(earlySnap.close).not.toBe(lateSnap.close)
  })
})

describe('compareSessionIndicators', () => {
  it('ranks meaningful shifts and writes plain-English sentences', () => {
    const previous = {
      asOf: '2024-09-13',
      close: 100,
      rsi14: 48.2,
      rollingVol20: 0.008,
      return1d: 0.001,
      return5d: 0.01,
      distanceFromSma20Pct: 0.5,
      relativeVolume: 0.9,
    }
    const current = {
      asOf: '2024-09-16',
      close: 102,
      rsi14: 54.6,
      rollingVol20: 0.012,
      return1d: -0.004,
      return5d: 0.022,
      distanceFromSma20Pct: 1.4,
      relativeVolume: 1.35,
    }

    const changes = compareSessionIndicators(previous, current, 5)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.some((c) => c.sentence === 'RSI increased from 48.2 to 54.6')).toBe(
      true,
    )
    expect(changes.every((c) => c.significance > 0)).toBe(true)
    // Sorted by largest significance first.
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i]!.significance).toBeLessThanOrEqual(changes[i - 1]!.significance)
    }
  })

  it('ignores tiny moves below the meaningful thresholds', () => {
    const base = {
      asOf: '2024-09-13',
      close: 100,
      rsi14: 50,
      rollingVol20: 0.01,
      return1d: 0.001,
      return5d: 0.01,
      distanceFromSma20Pct: 1,
      relativeVolume: 1,
    }
    const nearlySame = {
      ...base,
      asOf: '2024-09-16',
      rsi14: 50.5,
      rollingVol20: 0.0102,
      return1d: 0.0012,
      return5d: 0.011,
      distanceFromSma20Pct: 1.05,
      relativeVolume: 1.02,
    }
    expect(compareSessionIndicators(base, nearlySame)).toEqual([])
  })

  it('returns an empty list when either snapshot is missing', () => {
    expect(compareSessionIndicators(null, null)).toEqual([])
  })
})

describe('shared indicator helpers', () => {
  it('matches expected RSI and return math on a tiny series', () => {
    const closes = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20]
    expect(rsi(closes, 14)).not.toBeNull()
    expect(tailReturn(closes, 1)).toBeCloseTo((20 - 19) / 19, 6)
  })
})
