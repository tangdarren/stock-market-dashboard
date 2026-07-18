import type { Confidence } from '../api/types'

export function confidenceLabel(prob: number): Confidence {
  const c = Math.max(prob, 1 - prob)
  if (c >= 0.65) return 'high'
  if (c >= 0.55) return 'moderate'
  return 'low'
}

export function confidenceCopy(label: Confidence): string {
  switch (label) {
    case 'high':
      return 'High'
    case 'moderate':
      return 'Moderate'
    case 'low':
      return 'Low'
  }
}
