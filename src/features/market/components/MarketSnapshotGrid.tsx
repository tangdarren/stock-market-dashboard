import { SpyPriceCard } from './SpyPriceCard'
import { TrendCard } from './TrendCard'
import { OvernightMovesCard } from './OvernightMovesCard'
import { todayFormatted, isMarketHours } from '@/lib/utils/date'
import { Badge } from '@/components/common/Badge'

export function MarketSnapshotGrid() {
  const marketOpen = isMarketHours()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{todayFormatted()}</p>
          <h2 className="mt-1 text-xl font-bold text-white">Market Snapshot</h2>
        </div>
        <Badge variant={marketOpen ? 'success' : 'neutral'} dot>
          {marketOpen ? 'Market Open' : 'Market Closed'}
        </Badge>
      </div>

      <SpyPriceCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendCard />
        <OvernightMovesCard />
      </div>
    </div>
  )
}
