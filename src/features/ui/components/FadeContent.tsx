import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils/cn'

interface FadeContentProps {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
  threshold?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
}

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getReducedMotionServerSnapshot() {
  return false
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )
}

export function FadeContent({
  children,
  className,
  delay = 0,
  duration = 600,
  threshold = 0.15,
  direction = 'up',
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = usePrefersReducedMotion()
  const [inView, setInView] = useState(false)
  const visible = reduceMotion || inView

  const translateMap = {
    up: 'translateY(24px)',
    down: 'translateY(-24px)',
    left: 'translateX(24px)',
    right: 'translateX(-24px)',
    none: 'none',
  }

  useEffect(() => {
    if (reduceMotion) return

    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.unobserve(el)
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, reduceMotion])

  return (
    <div
      ref={ref}
      className={cn(className)}
      data-reduced-motion={reduceMotion ? 'true' : 'false'}
      style={
        reduceMotion
          ? { opacity: 1, transform: 'none' }
          : {
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : translateMap[direction],
              transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
              transitionDelay: `${delay}ms`,
            }
      }
    >
      {children}
    </div>
  )
}
