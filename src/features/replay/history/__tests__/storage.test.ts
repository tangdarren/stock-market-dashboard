import { describe, expect, it } from 'vitest'
import { brierScore } from '../scoring'
import {
  appendAttempt,
  clearHistory,
  emptyHistory,
  loadHistory,
  MemoryStorage,
  normalizeAttempt,
  parseHistory,
  saveHistory,
  serializeHistory,
} from '../storage'
import {
  REPLAY_HISTORY_SCHEMA_VERSION,
  REPLAY_HISTORY_STORAGE_KEY,
  type ReplayAttempt,
} from '../types'

function sampleAttempt(overrides: Partial<ReplayAttempt> = {}): ReplayAttempt {
  return {
    id: 'attempt-1',
    replayDate: '2024-09-16',
    horizon: 1,
    userDirection: 'up',
    userConfidence: 70,
    userProbUp: 0.7,
    modelProbUp: 0.54,
    modelDirection: 'up',
    actualDirection: 'down',
    realizedReturn: -0.004,
    userCorrect: false,
    modelCorrect: false,
    brierScore: brierScore(0.7, 'down'),
    completedAt: '2024-09-16T20:00:00.000Z',
    ...overrides,
  }
}

describe('history serialization and parsing', () => {
  it('round-trips a valid payload', () => {
    const history = {
      version: REPLAY_HISTORY_SCHEMA_VERSION,
      attempts: [sampleAttempt()],
    }
    const raw = serializeHistory(history)
    expect(parseHistory(raw)).toEqual(history)
  })

  it('returns empty history for malformed JSON', () => {
    expect(parseHistory('{not-json')).toEqual(emptyHistory())
    expect(parseHistory(null)).toEqual(emptyHistory())
    expect(parseHistory('')).toEqual(emptyHistory())
  })

  it('drops attempts with missing required fields', () => {
    const raw = JSON.stringify({
      version: 1,
      attempts: [
        sampleAttempt(),
        { id: 'bad', replayDate: '2024-01-01' },
        null,
        'skip',
      ],
    })
    const parsed = parseHistory(raw)
    expect(parsed.attempts).toHaveLength(1)
    expect(parsed.attempts[0]?.id).toBe('attempt-1')
  })

  it('normalizeAttempt rejects out-of-range probabilities and confidence', () => {
    expect(normalizeAttempt(sampleAttempt({ userProbUp: 1.2 }))).toBeNull()
    expect(normalizeAttempt(sampleAttempt({ userConfidence: 40 }))).toBeNull()
    expect(
      normalizeAttempt({
        ...sampleAttempt(),
        horizon: 3,
      }),
    ).toBeNull()
  })
})

describe('schema-version handling', () => {
  it('resets unsupported or legacy schema versions safely', () => {
    expect(
      parseHistory(
        JSON.stringify({
          version: 0,
          attempts: [sampleAttempt()],
        }),
      ),
    ).toEqual(emptyHistory())

    expect(
      parseHistory(
        JSON.stringify({
          version: 99,
          attempts: [sampleAttempt()],
        }),
      ),
    ).toEqual(emptyHistory())

    expect(
      parseHistory(
        JSON.stringify({
          attempts: [sampleAttempt()],
        }),
      ),
    ).toEqual(emptyHistory())
  })
})

describe('duplicate-attempt prevention', () => {
  it('ignores appends with the same attempt id', () => {
    const storage = new MemoryStorage()
    const first = appendAttempt(sampleAttempt({ id: 'same-id' }), storage)
    const second = appendAttempt(
      sampleAttempt({
        id: 'same-id',
        userConfidence: 90,
        completedAt: '2024-09-17T00:00:00.000Z',
      }),
      storage,
    )

    expect(first.status).toBe('added')
    expect(second.status).toBe('duplicate')
    expect(loadHistory(storage).attempts).toHaveLength(1)
    expect(loadHistory(storage).attempts[0]?.userConfidence).toBe(70)
  })

  it('dedupes duplicate ids already present in stored JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      REPLAY_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        attempts: [sampleAttempt({ id: 'dup' }), sampleAttempt({ id: 'dup' })],
      }),
    )
    expect(loadHistory(storage).attempts).toHaveLength(1)
  })
})

describe('clear-history behavior', () => {
  it('removes stored attempts and leaves an empty v1 payload', () => {
    const storage = new MemoryStorage()
    appendAttempt(sampleAttempt(), storage)
    expect(loadHistory(storage).attempts).toHaveLength(1)

    const cleared = clearHistory(storage)
    expect(cleared).toEqual(emptyHistory())
    expect(loadHistory(storage)).toEqual(emptyHistory())
    expect(storage.getItem(REPLAY_HISTORY_STORAGE_KEY)).toBe(
      serializeHistory(emptyHistory()),
    )
  })
})

describe('unavailable browser storage', () => {
  it('handles throwing storage adapters without crashing', () => {
    const okStorage = new MemoryStorage()
    expect(saveHistory(emptyHistory(), okStorage)).toBe(true)

    const throwingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(saveHistory(emptyHistory(), throwingStorage)).toBe(false)
    expect(loadHistory(throwingStorage)).toEqual(emptyHistory())
    expect(() => clearHistory(throwingStorage)).not.toThrow()
  })

  it('rejects invalid append payloads without crashing', () => {
    const storage = new MemoryStorage()
    const result = appendAttempt(
      {
        ...sampleAttempt(),
        userDirection: 'sideways',
      } as unknown as ReplayAttempt,
      storage,
    )
    expect(result.status).toBe('invalid')
    expect(loadHistory(storage).attempts).toHaveLength(0)
  })
})
