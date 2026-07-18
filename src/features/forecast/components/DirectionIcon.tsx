import { cn } from '@/lib/utils/cn'
import type { Direction } from '../api/types'

interface DirectionIconProps {
  direction: Direction
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export function DirectionIcon({ direction, size = 'md', className }: DirectionIconProps) {
  const isUp = direction === 'up'
  const label = isUp ? 'Direction: up' : 'Direction: down'
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        sizeMap[size],
        isUp ? 'text-[#00FFB2]' : 'text-red-400',
        className,
      )}
    >
      {isUp ? (
        <>
          <path d="M5 15l7-7 7 7" />
          <path d="M12 8v10" />
        </>
      ) : (
        <>
          <path d="M5 9l7 7 7-7" />
          <path d="M12 16V6" />
        </>
      )}
    </svg>
  )
}
