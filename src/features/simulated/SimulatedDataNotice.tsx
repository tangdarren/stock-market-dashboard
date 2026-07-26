import { cn } from '@/lib/utils/cn'

export const SIMULATED_NOTICE_TITLE = 'Simulated workbook data'

export const SIMULATED_NOTICE_BODY =
  'Fictional scenario data from the synthetic workbook — not live market feeds or real SPY performance.'

interface SimulatedDataNoticeProps {
  className?: string
  /** Optional API disclaimer; falls back to the shared notice body. */
  detail?: string | null
}

/**
 * Restrained page-level banner for simulated mode.
 * Prefer one of these per page plus ModeBadge / small contextual labels —
 * not a warning inside every card.
 */
export function SimulatedDataNotice({
  className,
  detail,
}: SimulatedDataNoticeProps) {
  const body = detail?.trim() || SIMULATED_NOTICE_BODY

  return (
    <aside
      role="status"
      aria-label={SIMULATED_NOTICE_TITLE}
      className={cn(
        'rounded-xl border border-[#00FFB2]/25 bg-[#00FFB2]/[0.06] px-4 py-3 sm:px-5 sm:py-3.5',
        className,
      )}
    >
      <p className="text-sm font-semibold text-[#00FFB2]">{SIMULATED_NOTICE_TITLE}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{body}</p>
    </aside>
  )
}
