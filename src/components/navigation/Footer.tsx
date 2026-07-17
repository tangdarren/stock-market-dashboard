import { SITE } from '@/lib/constants/site'

export function Footer() {
  return (
    <footer className="border-t border-white/[0.05] bg-[#0d0c14] py-12">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="text-center">
          <p className="text-xs text-slate-700">
            © {new Date().getFullYear()} {SITE.name}. Built by {SITE.author}.
            Not financial advice.
          </p>
        </div>
      </div>
    </footer>
  )
}
