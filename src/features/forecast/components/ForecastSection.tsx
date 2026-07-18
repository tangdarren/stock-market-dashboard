import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

interface ForecastSectionProps {
  id: string
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /**
   * When true, the section header collapses into the visual container of the
   * child content instead of standing alone above it. Useful when a section
   * wraps a single dominant card.
   */
  compactHeader?: boolean
}

/**
 * Reusable section wrapper for the Forecast Lab page.
 *
 * Establishes a consistent typographic hierarchy — small eyebrow, section
 * heading, one-line supporting sentence — while leaving the children to
 * decide whether they need a glass card, a table, or plain layout. This
 * keeps individual sections from all looking like identical floating cards.
 */
export function ForecastSection({
  id,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  compactHeader = false,
}: ForecastSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-24', className)}
    >
      <div
        className={cn(
          'flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between',
          compactHeader ? 'mb-4' : 'mb-6',
        )}
      >
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#00FFB2]/70">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={`${id}-title`}
            className="text-xl font-semibold tracking-tight text-white sm:text-2xl"
          >
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-sm text-slate-400">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>

      <div>{children}</div>
    </section>
  )
}
