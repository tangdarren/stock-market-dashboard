import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
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
import { replayHistoryStorageKey } from '../history/types'

export interface UseReplayHistoryOptions {
  storage?: StorageLike
  recentLimit?: number
}

export function useReplayHistory(options: UseReplayHistoryOptions = {}) {
  const { enabled: simulated } = useSimulatedDataMode()
  const storage = useMemo(
    () => options.storage ?? resolveStorage(),
    [options.storage],
  )
  const recentLimit = options.recentLimit ?? 8
  const storageKey = replayHistoryStorageKey(simulated)

  const [history, setHistory] = useState<ReplayHistoryPayload>(() =>
    loadHistory(storage, storageKey),
  )

  // Reload the isolated bucket whenever live ↔ simulated flips.
  useEffect(() => {
    setHistory(loadHistory(storage, storageKey))
  }, [storage, storageKey])

  const recordAttempt = useCallback(
    (attempt: ReplayAttempt) => {
      const result = appendAttempt(attempt, storage, storageKey)
      if (result.status === 'added') {
        setHistory(result.history)
      } else if (result.status === 'duplicate') {
        // Keep React state aligned with storage without creating a new row.
        setHistory(result.history)
      }
      return result
    },
    [storage, storageKey],
  )

  const clear = useCallback(() => {
    const next = clearHistory(storage, storageKey)
    setHistory(next)
    return next
  }, [storage, storageKey])

  const refresh = useCallback(() => {
    const next = loadHistory(storage, storageKey)
    setHistory(next)
    return next
  }, [storage, storageKey])

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
    simulated,
  }
}
