/**
 * Explicit simulated-workbook data mode.
 *
 * Live Alpha Vantage / local artifacts remain the default. The user must flip
 * this switch for the frontend to send ``simulated=true``. Preference is
 * persisted in localStorage so it survives refreshes. This is separate from
 * the client-side demo override (sample fixtures when the backend is down).
 */

import { useCallback, useSyncExternalStore } from 'react'

export const SIMULATED_DATA_STORAGE_KEY = 'spy-forecast-lab:simulated-data'

const listeners = new Set<() => void>()

function read(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIMULATED_DATA_STORAGE_KEY) === '1'
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function notify() {
  for (const listener of listeners) listener()
}

/** Query-string fragment: only set when simulated mode is explicitly on. */
export function simulatedQueryParam(
  simulated: boolean,
): { simulated?: boolean } {
  return simulated ? { simulated: true } : {}
}

export function useSimulatedDataMode() {
  const enabled = useSyncExternalStore(subscribe, read, () => false)

  const enable = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIMULATED_DATA_STORAGE_KEY, '1')
    notify()
  }, [])

  const disable = useCallback(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(SIMULATED_DATA_STORAGE_KEY)
    notify()
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    if (next) {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(SIMULATED_DATA_STORAGE_KEY, '1')
      notify()
      return
    }
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(SIMULATED_DATA_STORAGE_KEY)
    notify()
  }, [])

  const toggle = useCallback(() => {
    setEnabled(!read())
  }, [setEnabled])

  return { enabled, enable, disable, setEnabled, toggle }
}
