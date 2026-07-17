import { Link } from 'react-router-dom'
import { ROUTES } from '@/lib/constants/routes'
import { usePageTitle } from '@/hooks/usePageTitle'

export function NotFoundPage() {
  usePageTitle('404')

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-8xl font-black text-white/[0.04]">404</p>
      <p className="-mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
        Page Not Found
      </p>
      <h1 className="mt-4 text-3xl font-bold text-white">
        This page doesn&apos;t exist.
      </h1>
      <p className="mt-3 text-sm text-slate-500">
        You may have followed a broken link or typed the wrong URL.
      </p>
      <Link
        to={ROUTES.HOME}
        className="mt-8 inline-flex h-10 items-center rounded-xl bg-[#00FFB2] px-6 text-sm font-semibold !text-black shadow-[0_0_20px_rgba(0,255,178,0.2)] transition-all hover:shadow-[0_0_30px_rgba(0,255,178,0.3)]"
      >
        Back to Home
      </Link>
    </div>
  )
}
