import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { NewsResponse } from '../api/types'
import { formatDateTime } from '../utils/format'

interface NewsContextPanelProps {
  news?: NewsResponse
}

export function NewsContextPanel({ news }: NewsContextPanelProps) {
  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Current market context
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">SPY news snapshot</h2>
          <p className="mt-1 text-xs text-slate-500">
            Not used by the current forecasting model.
          </p>
        </div>
        <Badge variant="neutral">Contextual only</Badge>
      </div>

      {!news || !news.available ? (
        <p className="mt-6 text-sm text-slate-400">
          News context isn&apos;t available right now
          {news?.reason ? ` — ${news.reason}` : ''}. This section will populate
          once the backend can reach Alpha Vantage NEWS_SENTIMENT.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {(news.articles ?? []).map((a, i) => (
            <li
              key={`${a.url}-${i}`}
              className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-slate-100 hover:text-[#00FFB2]"
                  >
                    {a.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    {a.source} · {formatDateTime(a.time_published)}
                  </p>
                </div>
                {a.overall_sentiment_label ? (
                  <span className="shrink-0 rounded bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
                    {a.overall_sentiment_label}
                    {a.overall_sentiment_score != null
                      ? ` · ${a.overall_sentiment_score.toFixed(2)}`
                      : null}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
