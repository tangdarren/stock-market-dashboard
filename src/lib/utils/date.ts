export function formatMarketDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function isMarketHours(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = et.getHours()
  const minute = et.getMinutes()
  const day = et.getDay()

  if (day === 0 || day === 6) return false
  const minutesSinceMidnight = hour * 60 + minute
  return minutesSinceMidnight >= 570 && minutesSinceMidnight < 960
}

export function todayFormatted(): string {
  return formatMarketDate(new Date())
}
