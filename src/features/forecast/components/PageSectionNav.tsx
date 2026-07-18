import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface PageSectionNavItem {
  id: string
  label: string
}

interface PageSectionNavProps {
  items: PageSectionNavItem[]
  className?: string
}

/**
 * Restrained local navigation for a long analytical page.
 *
 * - Anchor links use smooth scroll ONLY when the OS reports no motion
 *   preference; users who requested reduced motion get instant jumps.
 * - Horizontally scrollable on small screens (does not blow up the page
 *   width) with subtle inset fades.
 * - Active state derives from IntersectionObserver on the target sections
 *   so the nav feels aware of scroll position.
 */
export function PageSectionNav({ items, className }: PageSectionNavProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.target && (e.target as Element).id)
          .sort(
            (a, b) =>
              (a.boundingClientRect?.top ?? 0) -
              (b.boundingClientRect?.top ?? 0),
          )
        if (visible.length > 0) {
          setActiveId((visible[0].target as Element).id)
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: 0 },
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  const handleClick = useCallback(
    (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      const target = document.getElementById(id)
      if (!target) return
      event.preventDefault()
      const prefersReducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
      // Keep the URL hash in sync without triggering the browser's own scroll.
      history.replaceState(null, '', `#${id}`)
      setActiveId(id)
    },
    [],
  )

  return (
    <nav
      aria-label="Forecast page sections"
      className={cn(
        'relative -mx-6 overflow-x-auto px-6 pb-1 lg:mx-0 lg:px-0',
        '[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <ul className="flex min-w-max items-center gap-1 rounded-full border border-white/[0.05] bg-white/[0.02] p-1 backdrop-blur-sm">
        {items.map((item) => {
          const isActive = activeId === item.id
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'true' : undefined}
                onClick={handleClick(item.id)}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                  isActive
                    ? 'bg-[#00FFB2]/10 text-[#00FFB2]'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
