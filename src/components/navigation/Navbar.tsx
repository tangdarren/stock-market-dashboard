import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

const navLinks = [
  { label: 'Home', href: ROUTES.HOME },
  { label: 'Market', href: ROUTES.DAILY },
  { label: 'Learn', href: ROUTES.LEARN },
  { label: 'About', href: ROUTES.ABOUT },
]

export function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isActive = (href: string) =>
    href === ROUTES.HOME ? pathname === '/' : pathname === href

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        scrolled ? 'pointer-events-none -translate-y-4 opacity-0' : 'opacity-100',
      )}
    >
      <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link
          to={ROUTES.HOME}
          className="font-['Space_Grotesk',system-ui,sans-serif] text-2xl font-bold tracking-[0.12em] text-white transition-colors hover:text-[#00FFB2]"
        >
          TEMPEST
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'relative px-5 py-2.5 text-base font-medium transition-colors duration-200 lg:px-6',
                isActive(link.href)
                  ? 'text-[#00FFB2]'
                  : 'text-white/50 hover:text-white',
              )}
            >
              {link.label}
              {isActive(link.href) && (
                <motion.div
                  layoutId="nav-underline"
                  className="pointer-events-none absolute inset-x-[10%] -bottom-1 h-[2px] rounded-full bg-[#00FFB2]/60 shadow-[0_0_8px_rgba(0,255,178,0.4)]"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
            </Link>
          ))}
        </nav>

        {/* Mobile: compact inline nav so users can still reach every route. */}
        <nav
          aria-label="Primary mobile"
          className="flex items-center gap-1 md:hidden"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium transition-colors',
                isActive(link.href)
                  ? 'text-[#00FFB2]'
                  : 'text-white/50 hover:text-white',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
