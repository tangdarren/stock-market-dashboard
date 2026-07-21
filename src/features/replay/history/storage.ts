import type { ReplayDirection } from '../api/types'
import type { ReplayForecastHorizon } from '../utils/prediction'
import type {
  AppendAttemptResult,
  ReplayAttempt,
  ReplayHistoryPayload,
} from './types'
import {
  REPLAY_HISTORY_SCHEMA_VERSION,
  REPLAY_HISTORY_STORAGE_KEY,
} from './types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** In-memory fallback when localStorage is missing or throws. */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>()

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }
}

export function emptyHistory(): ReplayHistoryPayload {
  return { version: REPLAY_HISTORY_SCHEMA_VERSION, attempts: [] }
}

export function resolveStorage(preferred?: StorageLike | null): StorageLike {
  if (preferred) return preferred
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const ls = globalThis.localStorage
      const probe = '__replay_history_probe__'
      ls.setItem(probe, '1')
      ls.removeItem(probe)
      return ls
    }
  } catch {
    // Quota, privacy mode, or unavailable — fall through.
  }
  return new MemoryStorage()
}

/**
 * Parse a raw localStorage string into a validated history payload.
 * Malformed JSON, wrong versions, and unsupported shapes reset safely.
 */
export function parseHistory(raw: string | null | undefined): ReplayHistoryPayload {
  if (raw == null || raw === '') return emptyHistory()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyHistory()
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyHistory()
  }

  const record = parsed as Record<string, unknown>
  const version = record.version

  // Unknown / future / legacy schemas: reset rather than guess.
  if (version !== REPLAY_HISTORY_SCHEMA_VERSION) {
    return emptyHistory()
  }

  const attemptsRaw = record.attempts
  if (!Array.isArray(attemptsRaw)) {
    return emptyHistory()
  }

  const attempts: ReplayAttempt[] = []
  const seenIds = new Set<string>()
  for (const item of attemptsRaw) {
    const attempt = normalizeAttempt(item)
    if (!attempt) continue
    if (seenIds.has(attempt.id)) continue
    seenIds.add(attempt.id)
    attempts.push(attempt)
  }

  return { version: REPLAY_HISTORY_SCHEMA_VERSION, attempts }
}

export function serializeHistory(history: ReplayHistoryPayload): string {
  const payload: ReplayHistoryPayload = {
    version: REPLAY_HISTORY_SCHEMA_VERSION,
    attempts: history.attempts.filter((attempt) => Boolean(normalizeAttempt(attempt))),
  }
  return JSON.stringify(payload)
}

export function loadHistory(
  storage: StorageLike = resolveStorage(),
  key: string = REPLAY_HISTORY_STORAGE_KEY,
): ReplayHistoryPayload {
  try {
    return parseHistory(storage.getItem(key))
  } catch {
    return emptyHistory()
  }
}

export function saveHistory(
  history: ReplayHistoryPayload,
  storage: StorageLike = resolveStorage(),
  key: string = REPLAY_HISTORY_STORAGE_KEY,
): boolean {
  try {
    storage.setItem(key, serializeHistory(history))
    return true
  } catch {
    return false
  }
}

export function clearHistory(
  storage: StorageLike = resolveStorage(),
  key: string = REPLAY_HISTORY_STORAGE_KEY,
): ReplayHistoryPayload {
  const next = emptyHistory()
  try {
    storage.removeItem(key)
  } catch {
    // Still return the empty in-memory view.
  }
  // Persist an empty payload when possible so readers see a clean v1 doc.
  saveHistory(next, storage, key)
  return next
}

/**
 * Append a completed attempt. Duplicate IDs are ignored so React Strict Mode,
 * repeated reveals, and cached result reopenings cannot double-count.
 */
export function appendAttempt(
  attempt: ReplayAttempt,
  storage: StorageLike = resolveStorage(),
  key: string = REPLAY_HISTORY_STORAGE_KEY,
): AppendAttemptResult {
  const normalized = normalizeAttempt(attempt)
  const history = loadHistory(storage, key)
  if (!normalized) {
    return { status: 'invalid', history }
  }

  if (history.attempts.some((existing) => existing.id === normalized.id)) {
    return { status: 'duplicate', attempt: normalized, history }
  }

  const next: ReplayHistoryPayload = {
    version: REPLAY_HISTORY_SCHEMA_VERSION,
    attempts: [...history.attempts, normalized],
  }
  saveHistory(next, storage, key)
  return { status: 'added', attempt: normalized, history: next }
}

export function normalizeAttempt(value: unknown): ReplayAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  const replayDate =
    typeof raw.replayDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.replayDate)
      ? raw.replayDate
      : null
  const horizon = parseHorizon(raw.horizon)
  const userDirection = parseDirection(raw.userDirection)
  const modelDirection = parseDirection(raw.modelDirection)
  const actualDirection = parseDirection(raw.actualDirection)
  const userConfidence = parseConfidence(raw.userConfidence)
  const userProbUp = parseUnit(raw.userProbUp)
  const modelProbUp = parseUnit(raw.modelProbUp)
  const realizedReturn = parseFinite(raw.realizedReturn)
  const brierScore = parseFinite(raw.brierScore)
  const completedAt =
    typeof raw.completedAt === 'string' && raw.completedAt.trim()
      ? raw.completedAt.trim()
      : null
  const userCorrect = typeof raw.userCorrect === 'boolean' ? raw.userCorrect : null
  const modelCorrect = typeof raw.modelCorrect === 'boolean' ? raw.modelCorrect : null

  if (
    !id ||
    !replayDate ||
    horizon == null ||
    !userDirection ||
    !modelDirection ||
    !actualDirection ||
    userConfidence == null ||
    userProbUp == null ||
    modelProbUp == null ||
    realizedReturn == null ||
    brierScore == null ||
    !completedAt ||
    userCorrect == null ||
    modelCorrect == null
  ) {
    return null
  }

  return {
    id,
    replayDate,
    horizon,
    userDirection,
    userConfidence,
    userProbUp,
    modelProbUp,
    modelDirection,
    actualDirection,
    realizedReturn,
    userCorrect,
    modelCorrect,
    brierScore,
    completedAt,
  }
}

function parseHorizon(value: unknown): ReplayForecastHorizon | null {
  if (value === 1 || value === 5) return value
  if (value === '1') return 1
  if (value === '5') return 5
  return null
}

function parseDirection(value: unknown): ReplayDirection | null {
  return value === 'up' || value === 'down' ? value : null
}

function parseConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 50 || rounded > 100) return null
  return rounded
}

function parseUnit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 1) return null
  return value
}

function parseFinite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}
