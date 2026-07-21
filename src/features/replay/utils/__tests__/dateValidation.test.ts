import { describe, expect, it } from 'vitest'
import { isValidIsoDate, normalizeDateInput } from '../dateValidation'

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2024-09-16')).toBe(true)
    expect(isValidIsoDate('2020-02-29')).toBe(true)
  })

  it('rejects malformed or impossible dates', () => {
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('2024/09/16')).toBe(false)
    expect(isValidIsoDate('2024-13-01')).toBe(false)
    expect(isValidIsoDate('2024-02-30')).toBe(false)
    expect(isValidIsoDate('09-16-2024')).toBe(false)
  })
})

describe('normalizeDateInput', () => {
  it('trims whitespace', () => {
    expect(normalizeDateInput('  2024-09-16  ')).toBe('2024-09-16')
  })
})
