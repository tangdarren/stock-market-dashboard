import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface FadeContentProps {
  children: React.ReactNode
  className?: string
  delay?: number
  duration?: number
  threshold?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
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
  const [visible, setVisible] = useState(false)

  const translateMap = {
    up: 'translateY(24px)',
    down: 'translateY(-24px)',
    left: 'translateX(24px)',
    right: 'translateX(-24px)',
    none: 'none',
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(el)
        }
      },
      { threshold },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : translateMap[direction],
        transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}
