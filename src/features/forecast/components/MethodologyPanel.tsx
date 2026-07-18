import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { MetricsResponse } from '../api/types'

interface MethodologyPanelProps {
  metrics?: MetricsResponse
}

export function MethodologyPanel({ metrics }: MethodologyPanelProps) {
  const holdout1d = metrics?.horizons?.['1d']?.holdout
  const holdout5d = metrics?.horizons?.['5d']?.holdout
  const period1d = holdout1d
    ? `${holdout1d.test_period_start} → ${holdout1d.test_period_end} · N=${holdout1d.n_observations}`
    : null
  const period5d = holdout5d
    ? `${holdout5d.test_period_start} → ${holdout5d.test_period_end} · N=${holdout5d.n_observations}`
    : null

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Methodology & limitations
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            What&apos;s under the hood
          </h2>
        </div>
        <Badge variant="neutral">Educational analysis</Badge>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section
          title="Targets"
          items={[
            'target_1d = 1 if close[t+1] > close[t] else 0',
            'target_5d = 1 if close[t+5] > close[t] else 0',
            'Rows with unobservable future close retain NaN and are removed before any int cast.',
          ]}
        />
        <Section
          title="Features"
          items={[
            'Momentum & moving-average distances (5, 10, 20, 50 day)',
            'MACD, RSI(14), rate-of-change, consecutive-day streaks',
            'Rolling volatility (5, 20), ATR(14), Bollinger position',
            'Volume change, volume vs 20-day average, z-scored volume',
            'Overnight gap and open/close range',
          ]}
        />
        <Section
          title="Models compared"
          items={[
            'Baselines: majority-class, previous-day persistence',
            'Logistic regression with StandardScaler',
            'Random forest',
            'Histogram-based gradient boosting',
            'Selection: highest mean validation ROC-AUC, ties broken by Brier score',
          ]}
        />
        <Section
          title="Validation"
          items={[
            'Chronological holdout — final tail of the series is untouched during training',
            'TimeSeriesSplit(5) inside the training segment (no shuffling)',
            'Scalers fit only on training folds',
            'Explicit no-leakage test on features',
            period1d ? `1-day holdout: ${period1d}` : null,
            period5d ? `5-day holdout: ${period5d}` : null,
          ]}
        />
        <Section
          title="Data sources"
          items={[
            'Runtime: Alpha Vantage TIME_SERIES_DAILY (unadjusted)',
            'Training bootstrap: yfinance (unadjusted, auto_adjust=False)',
            'Same OHLCV convention shared across training and inference',
            'News (contextual only): Alpha Vantage NEWS_SENTIMENT — never fed to the model',
          ]}
        />
        <Section
          title="Limitations"
          items={[
            'Markets are noisy — modest predictive edges are expected',
            'Regime changes can invalidate historical relationships',
            'Alpha Vantage daily data is end-of-day, not live intraday',
            'Technical features are correlational, not causal',
            'Backtests do not guarantee future performance',
            'Model output is probabilistic and may be wrong — not financial advice',
          ]}
        />
      </div>
    </GlassCard>
  )
}

function Section({ title, items }: { title: string; items: (string | null)[] }) {
  const cleaned = items.filter(Boolean) as string[]
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#00FFB2]/80">
        {title}
      </h3>
      <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-slate-300 marker:text-slate-600">
        {cleaned.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
