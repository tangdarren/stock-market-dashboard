import type { KeyboardEvent } from 'react'

/** Roving-tabindex keyboard helper for ARIA radiogroups. */
export function cycleRadioOption<T>(
  key: string,
  options: readonly T[],
  current: T,
): T | null {
  if (options.length === 0) return null
  const index = options.indexOf(current)
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    const nextIndex = index < 0 ? 0 : (index + 1) % options.length
    return options[nextIndex] ?? null
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    const nextIndex = index <= 0 ? options.length - 1 : index - 1
    return options[nextIndex] ?? null
  }
  if (key === 'Home') return options[0] ?? null
  if (key === 'End') return options[options.length - 1] ?? null
  return null
}

export function handleRadioGroupKeyDown<T>(
  event: KeyboardEvent<HTMLElement>,
  options: readonly T[],
  current: T,
  onChange: (next: T) => void,
): void {
  const next = cycleRadioOption(event.key, options, current)
  if (next == null) return
  event.preventDefault()
  onChange(next)
}
