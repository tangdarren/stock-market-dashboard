import { Link } from 'react-router-dom'
import { SITE } from '@/lib/constants/site'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils/cn'

const footerLinkClass = cn(
  'text-slate-400 underline-offset-2 transition-colors',
  'hover:text-slate-200 hover:underline',
  'focus-visible:rounded-sm focus-visible:text-slate-200 focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]',
)

export function Footer() {
  return (
    <footer className="border-t border-white/[0.05] bg-[#0d0c14] py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()}{' '}
            <Link to={ROUTES.HOME} className={footerLinkClass}>
              {SITE.name}
            </Link>
            . Built by {SITE.author}. Not financial advice.
          </p>
        </div>
      </div>
    </footer>
  )
}
