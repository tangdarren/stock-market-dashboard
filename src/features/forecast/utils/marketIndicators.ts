import type { SpyBar } from '../api/types'

export type IndicatorKey =
  | 'rsi14'
  | 'rollingVol20'
  | 'return1d'
  | 'return5d'
  | 'distanceFromSma20'
  | 'relativeVolume'

export interface SessionIndicators {
  asOf: string
  close: number | null
  rsi14: number | null
  /** Sample std. of recent daily returns (fraction). */
  rollingVol20: number | null
  return1d: number | null
  return5d: number | null
  /** Distance from 20-day SMA in percent ((close − SMA) / SMA × 100). */
  distanceFromSma20Pct: number | null
  /** Latest volume ÷ 20-day average volume. */
  relativeVolume: number | null
}

export interface IndicatorChange {
  key: IndicatorKey
  label: string
  previous: number
  current: number
  /** Absolute magnitude used for ranking largest meaningful moves. */
  significance: number
  /** Plain-English description, e.g. "RSI increased from 48.2 to 54.6". */
  sentence: string
}

const INDICATOR_META: Record<
  IndicatorKey,
  {
    label: string
    /** Minimum absolute move (in the indicator’s native units) to surface. */
    minMeaningful: number
    /** Convert raw abs delta into a comparable significance score. */
    score: (absDelta: number) => number
    format: (value: number) => string
    verbUp: string
    verbDown: string
  }
> = {
  rsi14: {
    label: 'RSI',
    minMeaningful: 2,
    score: (d) => d / 5,
    format: (v) => v.toFixed(1),
    verbUp: 'increased',
    verbDown: 'decreased',
  },
  rollingVol20: {
    label: '20-day volatility',
    minMeaningful: 0.0005, // 0.05 percentage points of daily vol
    score: (d) => (d * 100) / 0.2,
    format: (v) => `${(v * 100).toFixed(2)}%`,
    verbUp: 'rose',
    verbDown: 'fell',
  },
  return1d: {
    label: '1-day return',
    minMeaningful: 0.0015,
    score: (d) => (d * 100) / 0.5,
    format: (v) => formatSignedPct(v * 100, 2),
    verbUp: 'moved higher',
    verbDown: 'moved lower',
  },
  return5d: {
    label: '5-day return',
    minMeaningful: 0.003,
    score: (d) => (d * 100) / 1,
    format: (v) => formatSignedPct(v * 100, 2),
    verbUp: 'moved higher',
    verbDown: 'moved lower',
  },
  distanceFromSma20: {
    label: 'Distance from the 20-day average',
    minMeaningful: 0.2, // percent points
    score: (d) => d / 0.5,
    format: (v) => formatSignedPct(v, 2),
    verbUp: 'moved further above',
    verbDown: 'moved further below',
  },
  relativeVolume: {
    label: 'Relative volume',
    minMeaningful: 0.1,
    score: (d) => d / 0.25,
    format: (v) => `${v.toFixed(2)}×`,
    verbUp: 'increased',
    verbDown: 'decreased',
  },
}

/**
 * Derive the same session indicators used on the market-conditions panel,
 * evaluated as of a specific calendar date (inclusive). Returns null when the
 * series does not contain that date or lacks enough history for any metric.
 */
export function indicatorsAtDate(
  series: readonly SpyBar[] | null | undefined,
  asOf: string | null | undefined,
): SessionIndicators | null {
  if (!series?.length || !asOf) return null

  const truncated = series.filter((bar) => bar.date <= asOf)
  if (truncated.length === 0) return null

  const latest = truncated[truncated.length - 1]!
  // Require an exact match (or the last bar on/before asOf that equals asOf).
  // Bars before asOf still allow computing indicators when the exact session
  // is present; if asOf is missing from the series, use the last bar only when
  // its date equals asOf.
  if (latest.date !== asOf) {
    // Still allow last available bar before asOf for weekends/holidays gaps —
    // but only if we're within a few days; otherwise treat as unavailable.
    const gapDays = calendarDayGap(latest.date, asOf)
    if (gapDays == null || gapDays > 4) return null
  }

  const closes = truncated.map((b) => b.close)
  const volumes = truncated.map((b) => b.volume)
  const sma20 = tailMean(closes, 20)
  const avgVol20 = tailMean(volumes, 20)

  return {
    asOf: latest.date,
    close: latest.close,
    rsi14: rsi(closes, 14),
    rollingVol20: rollingVol(closes, 20),
    return1d: tailReturn(closes, 1),
    return5d: tailReturn(closes, 5),
    distanceFromSma20Pct:
      sma20 != null && sma20 !== 0 ? ((latest.close - sma20) / sma20) * 100 : null,
    relativeVolume:
      avgVol20 != null && avgVol20 > 0 ? latest.volume / avgVol20 : null,
  }
}

/**
 * Rank the largest meaningful indicator shifts between two sessions.
 * Descriptive context only — does not claim these changes caused the forecast.
 */
export function compareSessionIndicators(
  previous: SessionIndicators | null | undefined,
  current: SessionIndicators | null | undefined,
  limit = 5,
): IndicatorChange[] {
  if (!previous || !current) return []

  const pairs: Array<{ key: IndicatorKey; previous: number | null; current: number | null }> = [
    { key: 'rsi14', previous: previous.rsi14, current: current.rsi14 },
    { key: 'rollingVol20', previous: previous.rollingVol20, current: current.rollingVol20 },
    { key: 'return1d', previous: previous.return1d, current: current.return1d },
    { key: 'return5d', previous: previous.return5d, current: current.return5d },
    {
      key: 'distanceFromSma20',
      previous: previous.distanceFromSma20Pct,
      current: current.distanceFromSma20Pct,
    },
    { key: 'relativeVolume', previous: previous.relativeVolume, current: current.relativeVolume },
  ]

  const changes: IndicatorChange[] = []
  for (const pair of pairs) {
    if (pair.previous == null || pair.current == null) continue
    const meta = INDICATOR_META[pair.key]
    const absDelta = Math.abs(pair.current - pair.previous)
    if (absDelta < meta.minMeaningful) continue

    const increased = pair.current > pair.previous
    // Distance-from-SMA wording: "moved further above/below" is awkward when
    // crossing from negative to positive. Prefer generic increased/decreased
    // for that metric.
    const verb =
      pair.key === 'distanceFromSma20'
        ? increased
          ? 'increased'
          : 'decreased'
        : increased
          ? meta.verbUp
          : meta.verbDown

    changes.push({
      key: pair.key,
      label: meta.label,
      previous: pair.previous,
      current: pair.current,
      significance: meta.score(absDelta),
      sentence: `${meta.label} ${verb} from ${meta.format(pair.previous)} to ${meta.format(pair.current)}`,
    })
  }

  return changes
    .sort((a, b) => b.significance - a.significance)
    .slice(0, limit)
}

// ---------- pure math helpers (shared with market-conditions display) --------

export function tailMean(values: number[], window: number): number | null {
  if (values.length < window) return null
  const slice = values.slice(-window)
  return slice.reduce((sum, v) => sum + v, 0) / window
}

export function rollingVol(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  const returns: number[] = []
  for (let i = closes.length - window; i < closes.length; i++) {
    returns.push((closes[i]! - closes[i - 1]!) / closes[i - 1]!)
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length
  const variance =
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance)
}

export function tailReturn(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  const last = closes[closes.length - 1]!
  const first = closes[closes.length - 1 - window]!
  return (last - first) / first
}

export function rsi(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null
  let gains = 0
  let losses = 0
  const start = closes.length - window - 1
  for (let i = start + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    if (diff >= 0) gains += diff
    else losses += -diff
  }
  const avgGain = gains / window
  const avgLoss = losses / window
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function formatSignedPct(value: number, decimals: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

function calendarDayGap(earlier: string, later: string): number | null {
  const a = Date.parse(`${earlier}T00:00:00Z`)
  const b = Date.parse(`${later}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}
