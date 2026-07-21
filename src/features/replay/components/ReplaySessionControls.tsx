interface ReplaySessionControlsProps {
  dateInput: string
  onDateChange: (value: string) => void
  onLoadSession: () => void
  onRandomSession: () => void
  isLoading: boolean
  minEligibleDate?: string | null
  maxEligibleDate?: string | null
}

export function ReplaySessionControls({
  dateInput,
  onDateChange,
  onLoadSession,
  onRandomSession,
  isLoading,
  minEligibleDate,
  maxEligibleDate,
}: ReplaySessionControlsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Historical date
          </span>
          <input
            type="date"
            value={dateInput}
            min={minEligibleDate ?? undefined}
            max={maxEligibleDate ?? undefined}
            onChange={(event) => onDateChange(event.target.value)}
            disabled={isLoading}
            className="w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#00FFB2]/40 disabled:opacity-50 [color-scheme:dark]"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLoadSession}
            disabled={isLoading || !dateInput}
            aria-busy={isLoading}
            className="rounded-xl bg-[#00FFB2] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#00e6a0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load session
          </button>
          <button
            type="button"
            onClick={onRandomSession}
            disabled={isLoading}
            className="rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-[#00FFB2]/30 hover:text-[#00FFB2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Random session
          </button>
        </div>
      </div>

      {(minEligibleDate || maxEligibleDate) && (
        <p className="text-xs text-slate-500">
          Eligible range
          {minEligibleDate ? (
            <>
              {' '}
              from <span className="text-slate-300">{minEligibleDate}</span>
            </>
          ) : null}
          {maxEligibleDate ? (
            <>
              {' '}
              to <span className="text-slate-300">{maxEligibleDate}</span>
            </>
          ) : null}
          .
        </p>
      )}
    </div>
  )
}
