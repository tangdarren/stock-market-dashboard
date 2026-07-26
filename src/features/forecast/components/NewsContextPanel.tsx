import { Badge } from '@/components/common/Badge'
import type { NewsResponse } from '../api/types'
import { formatDateTime } from '../utils/format'

interface NewsContextPanelProps {
  news?: NewsResponse
  /** Explicit simulated-mode labeling (toggle on or payload mode). */
  isSimulated?: boolean
}

export function NewsContextPanel({
  news,
  isSimulated = false,
}: NewsContextPanelProps) {
  const simulated =
    isSimulated || news?.mode === 'simulated' || news?.source === 'simulated_workbook'

  if (!news || !news.available) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        {simulated ? (
          <div className="mb-3">
            <Badge variant="info">Simulated news</Badge>
          </div>
        ) : null}
        <p className="text-sm text-slate-400">
          {simulated
            ? `Simulated news context isn’t available in this workbook${
                news?.reason ? ` — ${news.reason}` : ''
              }.`
            : `News context isn't available right now${
                news?.reason ? ` — ${news.reason}` : ''
              }. This section will populate once the backend can reach Alpha Vantage NEWS_SENTIMENT.`}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {simulated ? <Badge variant="info">Simulated news</Badge> : null}
        {simulated && news.note ? (
          <p className="text-xs text-slate-500">{news.note}</p>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(news.articles ?? []).map((a, i) => (
          <li
            key={`${a.url}-${i}`}
            className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm font-medium text-slate-100 hover:text-[#00FFB2] focus-visible:text-[#00FFB2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60"
                >
                  {a.title}
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  {a.source} · {formatDateTime(a.time_published)}
                </p>
              </div>
              {a.overall_sentiment_label ? (
                <SentimentPill
                  label={a.overall_sentiment_label}
                  score={a.overall_sentiment_score ?? null}
                  relevance={a.ticker_relevance ?? null}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {simulated && news.disclaimer ? (
        <p className="text-[11px] text-slate-500">{news.disclaimer}</p>
      ) : null}
    </div>
  )
}

function SentimentPill({
  label,
  score,
  relevance,
}: {
  label: string
  score: number | null
  relevance: number | null
}) {
  return (
    <div className="shrink-0 text-right">
      <span className="inline-block rounded bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
        {label}
        {score != null ? ` · ${score.toFixed(2)}` : null}
      </span>
      {relevance != null ? (
        <p className="mt-1 text-[11px] text-slate-500">
          SPY relevance {(relevance * 100).toFixed(0)}%
        </p>
      ) : null}
    </div>
  )
}
