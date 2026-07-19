/**
 * Runtime shape check for `/market/spy/analogues` responses.
 *
 * The rest of the frontend uses hand-written TypeScript interfaces for API
 * contracts (see `types.ts`) without a schema library like Zod. This file
 * follows the same convention but adds a defensive parser at the network
 * boundary for the analogue endpoint so the panel can never render on a
 * partially-malformed payload — every field is either validated or coerced
 * to a safe null/empty default before it reaches React state.
 */

import type {
  AnalogueMethodology,
  AnalogueRecord,
  AnalogueResponse,
  AnalogueSummary,
  Direction,
  Mode,
} from './types'

export class AnalogueValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnalogueValidationError'
  }
}

const VALID_MODES: readonly Mode[] = [
  'live',
  'cached',
  'stale',
  'demo',
  'model_unavailable',
  'unavailable',
]

const VALID_DIRECTIONS: readonly Direction[] = ['up', 'down']

export function parseAnalogueResponse(raw: unknown): AnalogueResponse {
  if (!isObject(raw)) {
    throw new AnalogueValidationError('Response body is not an object.')
  }

  const available = raw.available === true
  const symbol = requireString(raw.symbol, 'symbol')
  const mode = normalizeMode(raw.mode)
  const disclaimer = requireString(raw.disclaimer, 'disclaimer')

  const methodology = parseMethodology(raw.methodology)
  const summary = parseSummary(raw.summary)
  const analogues = parseAnalogues(raw.analogues)

  return {
    available,
    symbol,
    query_date: optionalString(raw.query_date),
    features_as_of: optionalString(raw.features_as_of),
    data_as_of: optionalString(raw.data_as_of),
    limit: optionalNumber(raw.limit),
    methodology,
    summary,
    analogues,
    disclaimer,
    mode,
    cache_status: optionalString(raw.cache_status) ?? undefined,
    generated_at: optionalString(raw.generated_at) ?? undefined,
    reason: optionalString(raw.reason) ?? undefined,
    detail: optionalString(raw.detail) ?? undefined,
  }
}

function parseMethodology(raw: unknown): AnalogueMethodology {
  if (!isObject(raw)) {
    throw new AnalogueValidationError('methodology is missing or malformed.')
  }
  const featuresRaw = raw.features
  const features =
    Array.isArray(featuresRaw) && featuresRaw.every((f) => typeof f === 'string')
      ? (featuresRaw as string[])
      : []
  return {
    method: requireString(raw.method, 'methodology.method'),
    distance: optionalString(raw.distance) ?? undefined,
    features,
    feature_schema_version: optionalString(raw.feature_schema_version) ?? undefined,
    minimum_separation_days: requireFiniteNumber(
      raw.minimum_separation_days,
      'methodology.minimum_separation_days',
    ),
    candidate_pool_size: optionalNumber(raw.candidate_pool_size) ?? undefined,
  }
}

function parseSummary(raw: unknown): AnalogueSummary | null {
  if (raw == null) return null
  if (!isObject(raw)) {
    throw new AnalogueValidationError('summary is not an object.')
  }
  return {
    analogue_count: requireFiniteNumber(raw.analogue_count, 'summary.analogue_count'),
    positive_after_1d_pct: optionalNumber(raw.positive_after_1d_pct),
    positive_after_5d_pct: optionalNumber(raw.positive_after_5d_pct),
    median_return_1d: optionalNumber(raw.median_return_1d),
    median_return_5d: optionalNumber(raw.median_return_5d),
    avg_return_1d: optionalNumber(raw.avg_return_1d),
    avg_return_5d: optionalNumber(raw.avg_return_5d),
  }
}

function parseAnalogues(raw: unknown): AnalogueRecord[] {
  if (!Array.isArray(raw)) {
    throw new AnalogueValidationError('analogues is not an array.')
  }
  const parsed: AnalogueRecord[] = []
  raw.forEach((entry, index) => {
    if (!isObject(entry)) {
      throw new AnalogueValidationError(`analogues[${index}] is not an object.`)
    }
    const similarity = requireFiniteNumber(entry.similarity, `analogues[${index}].similarity`)
    parsed.push({
      date: requireString(entry.date, `analogues[${index}].date`),
      similarity: clamp(similarity, 0, 100),
      distance: requireFiniteNumber(entry.distance, `analogues[${index}].distance`),
      close: requireFiniteNumber(entry.close, `analogues[${index}].close`),
      return_1d: requireFiniteNumber(entry.return_1d, `analogues[${index}].return_1d`),
      return_5d: requireFiniteNumber(entry.return_5d, `analogues[${index}].return_5d`),
      direction_1d: requireDirection(entry.direction_1d, `analogues[${index}].direction_1d`),
      direction_5d: requireDirection(entry.direction_5d, `analogues[${index}].direction_5d`),
      rsi_14: optionalNumber(entry.rsi_14),
      rolling_vol_20: optionalNumber(entry.rolling_vol_20),
      distance_from_sma_20: optionalNumber(entry.distance_from_sma_20),
      relative_volume: optionalNumber(entry.relative_volume),
    })
  })
  return parsed
}

// --- primitives --------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AnalogueValidationError(`${field} is missing or not a non-empty string.`)
  }
  return value
}

function optionalString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  return value
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AnalogueValidationError(`${field} is missing or not a finite number.`)
  }
  return value
}

function optionalNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function requireDirection(value: unknown, field: string): Direction {
  if (typeof value !== 'string' || !VALID_DIRECTIONS.includes(value as Direction)) {
    throw new AnalogueValidationError(`${field} must be "up" or "down".`)
  }
  return value as Direction
}

function normalizeMode(value: unknown): Mode {
  if (typeof value === 'string' && VALID_MODES.includes(value as Mode)) {
    return value as Mode
  }
  return 'unavailable'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
