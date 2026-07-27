import { useState, useEffect, useId, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SimulatedDataToggle } from '@/features/simulated/SimulatedDataToggle'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

const navLinks = [
  { label: 'Home', href: ROUTES.HOME },
  { label: 'Market', href: ROUTES.DAILY },
  { label: 'Replay Lab', href: ROUTES.REPLAY },
  { label: 'Model Monitor', href: ROUTES.MONITOR },
  { label: 'Learn', href: ROUTES.LEARN },
  { label: 'About', href: ROUTES.ABOUT },
]

export function Navbar() {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const isActive = (href: string) =>
    href === ROUTES.HOME ? pathname === '/' : pathname === href

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-white/[0.08] bg-[rgba(13,12,20,0.85)] backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 transition-[height] duration-300 lg:px-8',
          scrolled ? 'h-16' : 'h-24',
        )}
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Link
            to={ROUTES.HOME}
            className="font-['Space_Grotesk',system-ui,sans-serif] text-2xl font-bold tracking-[0.12em] text-white transition-colors hover:text-[#00FFB2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60"
          >
            TEMPEST
          </Link>
          <SimulatedDataToggle className="hidden shrink-0 md:inline-flex" />
        </div>

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
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
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

        {/* Mobile: compact menu button + panel */}
        <div className="relative md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white',
              'transition-colors hover:border-white/25 hover:bg-white/[0.06]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {menuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>

          {menuOpen && (
            <nav
              id={menuId}
              aria-label="Primary mobile"
              className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-white/[0.08] bg-[rgba(13,12,20,0.95)] p-2 shadow-lg backdrop-blur-md"
            >
              <ul className="flex flex-col gap-0.5">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      aria-current={isActive(link.href) ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'block rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                        isActive(link.href)
                          ? 'bg-[#00FFB2]/10 text-[#00FFB2]'
                          : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-white/[0.08] pt-2">
                <SimulatedDataToggle className="w-full justify-center" />
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}
