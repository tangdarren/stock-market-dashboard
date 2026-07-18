import { Badge } from '@/components/common/Badge'
import type { Mode } from '../api/types'

interface ModeBadgeProps {
  mode: Mode
}

const MAP: Record<Mode, { label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; dot: boolean }> = {
  live: { label: 'Live data', variant: 'success', dot: true },
  cached: { label: 'Cached', variant: 'info', dot: true },
  stale: { label: 'Stale cache', variant: 'warning', dot: true },
  demo: { label: 'Demo data', variant: 'warning', dot: true },
  model_unavailable: { label: 'Model unavailable', variant: 'danger', dot: false },
  unavailable: { label: 'Backend unavailable', variant: 'danger', dot: false },
}

export function ModeBadge({ mode }: ModeBadgeProps) {
  const info = MAP[mode] ?? MAP.unavailable
  return (
    <Badge variant={info.variant} dot={info.dot}>
      {info.label}
    </Badge>
  )
}
