import { useCallback, useMemo, useState } from 'react'
import {
  appendAttempt,
  clearHistory,
  loadHistory,
  recentAttempts,
  resolveStorage,
  summarizePerformance,
  type ReplayAttempt,
  type ReplayHistoryPayload,
  type ReplayPerformanceSummary,
  type StorageLike,
} from '../history'

export interface UseReplayHistoryOptions {
  storage?: StorageLike
  recentLimit?: number
}

export function useReplayHistory(options: UseReplayHistoryOptions = {}) {
  const storage = useMemo(
    () => options.storage ?? resolveStorage(),
    [options.storage],
  )
  const recentLimit = options.recentLimit ?? 8

  const [history, setHistory] = useState<ReplayHistoryPayload>(() =>
    loadHistory(storage),
  )

  const recordAttempt = useCallback(
    (attempt: ReplayAttempt) => {
      const result = appendAttempt(attempt, storage)
      if (result.status === 'added') {
        setHistory(result.history)
      } else if (result.status === 'duplicate') {
        // Keep React state aligned with storage without creating a new row.
        setHistory(result.history)
      }
      return result
    },
    [storage],
  )

  const clear = useCallback(() => {
    const next = clearHistory(storage)
    setHistory(next)
    return next
  }, [storage])

  const refresh = useCallback(() => {
    const next = loadHistory(storage)
    setHistory(next)
    return next
  }, [storage])

  const summary: ReplayPerformanceSummary = useMemo(
    () => summarizePerformance(history.attempts),
    [history.attempts],
  )

  const recent = useMemo(
    () => recentAttempts(history.attempts, recentLimit),
    [history.attempts, recentLimit],
  )

  return {
    history,
    attempts: history.attempts,
    summary,
    recent,
    recordAttempt,
    clear,
    refresh,
  }
}
