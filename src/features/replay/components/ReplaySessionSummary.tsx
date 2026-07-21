import { formatReplayCalendarDate } from '../utils/formatReplayDate'
import type { ReplaySessionResponse } from '../api/types'

interface ReplaySessionSummaryProps {
  session: ReplaySessionResponse
}

export function ReplaySessionSummary({ session }: ReplaySessionSummaryProps) {
  if (!session.available || !session.selected_date) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryItem
        label="Selected date"
        value={formatReplayCalendarDate(session.selected_date)}
      />
      <SummaryItem label="Symbol" value={session.symbol} />
      <SummaryItem
        label="Chart sessions"
        value={`${session.session_count} through ${session.selected_date}`}
      />
      <SummaryItem
        label="Horizons"
        value={session.horizons.map((h) => `${h}d`).join(' · ')}
      />
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  )
}
