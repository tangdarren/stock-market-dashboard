import { MarketSnapshotGrid } from '@/features/market/components/MarketSnapshotGrid'
import { usePageTitle } from '@/hooks/usePageTitle'
import { FadeContent } from '@/features/ui/components/FadeContent'

export function DailyDashboardPage() {
  usePageTitle('Daily Dashboard')

  return (
    <div className="min-h-screen pt-24 pb-24">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-0 top-32 h-96 w-96 rounded-full bg-[#00FFB2]/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#00FFB2]/[0.02] blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeContent delay={0}>
          <div className="mb-8 lg:-translate-x-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#00FFB2]/80">
              Market
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Good morning. Here&apos;s the market.
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Data powered by Webull OpenAPI. Refreshes every 30 seconds during market hours.
            </p>
          </div>
        </FadeContent>

        <FadeContent delay={150}>
          <MarketSnapshotGrid />
        </FadeContent>
      </div>
    </div>
  )
}
