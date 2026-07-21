interface ReplayNearbyDatesProps {
  before: string | null
  after: string | null
  onSelect: (date: string) => void
  disabled?: boolean
}

export function ReplayNearbyDates({
  before,
  after,
  onSelect,
  disabled = false,
}: ReplayNearbyDatesProps) {
  if (!before && !after) return null

  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
        Nearby eligible dates
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {before ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(before)}
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-[#00FFB2]/30 hover:text-[#00FFB2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Before: {before}
          </button>
        ) : null}
        {after ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(after)}
            className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-200 transition-colors hover:border-[#00FFB2]/30 hover:text-[#00FFB2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            After: {after}
          </button>
        ) : null}
      </div>
    </div>
  )
}
