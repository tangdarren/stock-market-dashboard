import { describe, expect, it } from 'vitest'
import { formatReplayCalendarDate } from '../formatReplayDate'

describe('formatReplayCalendarDate', () => {
  it('formats YYYY-MM-DD without UTC day shift', () => {
    expect(formatReplayCalendarDate('2024-09-16')).toMatch(/September 16, 2024/)
  })

  it('returns the original string when not ISO', () => {
    expect(formatReplayCalendarDate('not-a-date')).toBe('not-a-date')
  })
})
