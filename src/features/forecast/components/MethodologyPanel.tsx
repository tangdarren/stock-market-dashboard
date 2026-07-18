import type { ReactNode } from 'react'
import type { MetricsResponse } from '../api/types'
import { cn } from '@/lib/utils/cn'

interface MethodologyPanelProps {
  metrics?: MetricsResponse
}

/**
 * Methodology and limitations. Uses semantic <details>/<summary> accordions
 * so it works without JavaScript, is keyboard accessible by default, and
 * announces correctly to screen readers.
 */
export function MethodologyPanel({ metrics }: MethodologyPanelProps) {
  const holdout1d = metrics?.horizons?.['1d']?.holdout
  const holdout5d = metrics?.horizons?.['5d']?.holdout
  const period1d = holdout1d
    ? `${holdout1d.test_period_start} → ${holdout1d.test_period_end} · N=${holdout1d.n_observations}`
    : null
  const period5d = holdout5d
    ? `${holdout5d.test_period_start} → ${holdout5d.test_period_end} · N=${holdout5d.n_observations}`
    : null

  const sections: { title: string; content: ReactNode; defaultOpen?: boolean }[] = [
    {
      title: 'What the model predicts',
      defaultOpen: true,
      content: (
        <List
          items={[
            'target_1d = 1 if the next daily close is higher than today\u2019s close.',
            'target_5d = 1 if the close five trading sessions from now is higher than today\u2019s close.',
            'Rows without an observable future close retain NaN and are removed before any cast; missing future data never becomes an artificial class-0 target.',
          ]}
        />
      ),
    },
    {
      title: 'Features used',
      content: (
        <List
          items={[
            'Momentum and moving-average distances at 5, 10, 20, and 50 sessions.',
            'MACD, RSI(14), rate-of-change, and consecutive-day streaks.',
            'Rolling volatility (5, 20 sessions), ATR(14), Bollinger band position.',
            'Volume change, volume vs 20-day average, z-scored volume.',
            'Overnight gap and open/close daily range.',
          ]}
        />
      ),
    },
    {
      title: 'Models compared',
      content: (
        <List
          items={[
            'Baselines: majority-class predictor and previous-day persistence.',
            'Logistic regression with a StandardScaler pipeline.',
            'Random forest classifier.',
            'Histogram-based gradient boosting.',
            'Selection: highest mean validation ROC-AUC across the CV folds; ties broken by Brier score.',
          ]}
        />
      ),
    },
    {
      title: 'Chronological validation',
      content: (
        <List
          items={[
            'The final tail of the series is held out and never touches training.',
            'Inside the training segment, TimeSeriesSplit(5) provides a walk-forward cross-validation without shuffling.',
            'Scalers and transformations are fit only on the training folds — no future information leaks into any fold.',
            period1d ? `One-day holdout: ${period1d}.` : null,
            period5d ? `Five-day holdout: ${period5d}.` : null,
          ]}
        />
      ),
    },
    {
      title: 'Leakage prevention',
      content: (
        <List
          items={[
            'Backward-looking return features (return_1d, return_5d) live in features.py; forward-looking outcomes live in targets.py under distinct realized_future_return_{h}d names to prevent column collision.',
            'A dedicated feature test perturbs the tail of the input frame and asserts earlier feature values are unchanged.',
            'A smoke test rejects any horizon that reports implausible perfect out-of-sample scores on a random walk.',
          ]}
        />
      ),
    },
    {
      title: 'Data sources',
      content: (
        <List
          items={[
            'Runtime market data: Alpha Vantage TIME_SERIES_DAILY (unadjusted OHLC and raw volume).',
            'Training bootstrap: yfinance with auto_adjust=False (identical unadjusted convention).',
            'Both feeds pass through a shared normalizer so column names, dtypes, trading dates (America/New_York), and duplicate handling match exactly.',
            'News (contextual only): Alpha Vantage NEWS_SENTIMENT. Never fed to the model.',
          ]}
        />
      ),
    },
    {
      title: 'Runtime vs training data',
      content: (
        <List
          items={[
            'Runtime feature schema is validated against the trained schema before inference; mismatches surface as model_unavailable rather than a silent misprediction.',
            'Forecasts use only the latest completed daily bar in the America/New_York timezone. Weekends and US market holidays are honored.',
            'API keys live only in server/.env; the frontend never sees them and every request to Alpha Vantage goes through the backend proxy.',
          ]}
        />
      ),
    },
    {
      title: 'Model limitations',
      content: (
        <List
          items={[
            'Daily equity direction is close to a coin flip. A realistic upper bound is a few percentage points of edge over the strongest baseline.',
            'Explanations are correlational and contextual, not causal. They describe which levers the model responds to, not why markets moved.',
            'Technical features cannot anticipate exogenous shocks (macro data, earnings surprises, geopolitical events).',
          ]}
        />
      ),
    },
    {
      title: 'Market regime changes',
      content: (
        <List
          items={[
            'Rate cycles, macro shocks, and structural shifts can invalidate historical relationships.',
            'Metrics are computed on a chronological holdout, but performance during a genuinely new regime can differ from the reported numbers.',
            'Retrain and re-evaluate periodically rather than trusting old artifacts indefinitely.',
          ]}
        />
      ),
    },
    {
      title: 'Educational disclaimer',
      content: (
        <List
          items={[
            'This project is a portfolio and learning exercise. Nothing on this page is investment advice, and no output should be interpreted as a trade signal.',
            'Model output is probabilistic and may be wrong. Backtests do not guarantee future performance.',
            'Consult a licensed financial professional before making investment decisions.',
          ]}
        />
      ),
    },
  ]

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02]">
      <ul className="divide-y divide-white/[0.05]">
        {sections.map((section) => (
          <li key={section.title}>
            <MethodologyAccordion
              title={section.title}
              defaultOpen={section.defaultOpen}
            >
              {section.content}
            </MethodologyAccordion>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MethodologyAccordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details
      className={cn(
        'group px-5 py-4 open:pb-5 [&_summary::-webkit-details-marker]:hidden',
      )}
      open={defaultOpen}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0c14]',
        )}
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        <ChevronIcon />
      </summary>
      <div className="mt-3 text-sm text-slate-300">{children}</div>
    </details>
  )
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-180"
    >
      <path d="M6 8l4 4 4-4" />
    </svg>
  )
}

function List({ items }: { items: (string | null | false)[] }) {
  const cleaned = items.filter((x): x is string => typeof x === 'string' && x.length > 0)
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300 marker:text-slate-600">
      {cleaned.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
