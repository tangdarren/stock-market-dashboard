import {
  formatInsightFlips,
  formatInsightLargestChange,
  formatInsightRange,
  formatInsightStreak,
  type ForecastEvolutionInsights as ForecastEvolutionInsightsData,
} from '../utils/forecastEvolutionInsights'

interface ForecastEvolutionInsightsProps {
  insights: ForecastEvolutionInsightsData
}

export function ForecastEvolutionInsights({ insights }: ForecastEvolutionInsightsProps) {
  const horizon = insights.horizon === 'oneDay' ? '1-day' : '5-day'

  return (
    <div
      className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid="forecast-evolution-insights"
    >
      <InsightStat label="Current streak" value={formatInsightStreak(insights.streak)} />
      <InsightStat
        label="Recent range"
        value={formatInsightRange(insights.minProb, insights.maxProb)}
      />
      <InsightStat
        label="Largest change"
        value={formatInsightLargestChange(insights.largestChangePp)}
      />
      <InsightStat label="Directional flips" value={formatInsightFlips(insights.flipCount)} />
      <p className="col-span-2 text-[11px] leading-relaxed text-slate-500 sm:col-span-4">
        Compact {horizon} stats from the displayed window. They describe recent
        model probabilities, not a trading record.
      </p>
    </div>
  )
}

function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xs font-semibold text-slate-100">{value}</p>
    </div>
  )
}
