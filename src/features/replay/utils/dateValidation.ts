const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Return true when ``value`` is a structurally valid calendar date (YYYY-MM-DD). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(year, month - 1, day))
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  )
}

export function normalizeDateInput(value: string): string {
  return value.trim()
}
