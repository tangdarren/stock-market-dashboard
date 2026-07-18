import { useCallback, useSyncExternalStore } from 'react'

/**
 * Explicit opt-in flag for "sample data" fallback when the backend is
 * unavailable. Correction #8: we never silently substitute demo data. The user
 * has to click "Show sample data" for this flag to flip on, and a persistent
 * banner reads "Demo data — backend unavailable" while it is on.
 */

const KEY = 'spy-forecast-lab:demo-override'
const listeners = new Set<() => void>()

function read(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(KEY) === '1'
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notify() {
  for (const l of listeners) l()
}

export function useDemoOverride() {
  const enabled = useSyncExternalStore(subscribe, read, () => false)

  const enable = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(KEY, '1')
    notify()
  }, [])
  const disable = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(KEY)
    notify()
  }, [])

  return { enabled, enable, disable }
}
