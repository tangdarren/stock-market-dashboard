import type { AnalogueRecord, AnalogueResponse, AnalogueSummary } from '../api/types'

/**
 * Deterministically build the plain-English summary sentence for the
 * Historical Analogues panel from the actual response values.
 *
 * The rules are intentionally conservative so we never imply that similarity
 * guarantees repetition — we only report counts.
 */
export function buildAnalogueSummarySentence(response: AnalogueResponse | null | undefined): string {
  if (!response) return ''
  if (!response.available) {
    return 'Historical analogues are not available for this session.'
  }

  const analogues = response.analogues ?? []
  const n = analogues.length
  if (n === 0) {
    return 'No sufficiently close historical matches were found for this session.'
  }

  const upNext = countDirection(analogues, 'direction_1d', 'up')
  const upFive = countDirection(analogues, 'direction_5d', 'up')
  const downNext = n - upNext
  const downFive = n - upFive

  if (n === 1) {
    return (
      `The single closest historical match finished ` +
      `${upNext === 1 ? 'higher' : 'lower'} the next session and ` +
      `${upFive === 1 ? 'higher' : 'lower'} five sessions later.`
    )
  }

  return (
    `Among the ${numberWord(n)} closest historical matches, ` +
    `${countPhrase(upNext, downNext, 'higher', 'lower')} the next session ` +
    `and ${countPhrase(upFive, downFive, 'higher', 'lower')} five sessions later.`
  )
}

function countDirection(
  records: AnalogueRecord[],
  key: 'direction_1d' | 'direction_5d',
  value: 'up' | 'down',
): number {
  let count = 0
  for (const r of records) if (r[key] === value) count += 1
  return count
}

function countPhrase(
  positive: number,
  negative: number,
  positiveLabel: string,
  negativeLabel: string,
): string {
  if (positive === 0) {
    return `all ${numberWord(negative)} finished ${negativeLabel}`
  }
  if (negative === 0) {
    return `all ${numberWord(positive)} finished ${positiveLabel}`
  }
  return `${numberWord(positive)} finished ${positiveLabel} and ${numberWord(negative)} ${negativeLabel}`
}

/**
 * Render small counts as English words for readability. Falls back to
 * digits for larger numbers so the sentence stays compact.
 */
export function numberWord(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n)
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
  ]
  if (n <= 10) return words[n]
  return String(n)
}

export function formatSignedPercent(value: number | null, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(decimals)}%`
}

export function formatPositiveShare(
  pct: number | null,
  summary: AnalogueSummary | null | undefined,
): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const n = summary?.analogue_count ?? 0
  if (n <= 0) return `${pct.toFixed(0)}%`
  const winners = Math.round((pct / 100) * n)
  return `${pct.toFixed(0)}% (${winners} of ${n})`
}
