import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { BacktestSummary as BacktestData } from '../api/types'
import { formatPercent } from '../utils/format'

interface BacktestSummaryProps {
  backtest?: BacktestData
}

export function BacktestSummary({ backtest }: BacktestSummaryProps) {
  if (!backtest || !backtest.available) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Educational backtest
          </p>
          <Badge variant="neutral">1-day model only</Badge>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          {backtest?.reason === 'no_holdout_predictions'
            ? 'No holdout predictions available to backtest.'
            : 'Backtest not applicable for this horizon.'}
        </p>
      </GlassCard>
    )
  }

  const {
    threshold,
    cumulative_return_strategy,
    cumulative_return_buy_hold,
    max_drawdown_strategy,
    trades,
    hit_rate_when_in_market,
    test_period_start,
    test_period_end,
    cost_bps_per_side,
  } = backtest

  const alpha =
    (cumulative_return_strategy ?? 0) - (cumulative_return_buy_hold ?? 0)

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Educational backtest
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">
            Rule: hold SPY when p<sub>up</sub> ≥ {threshold}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Uses only walk-forward, out-of-sample 1-day predictions.
            {test_period_start ? ` Test period ${test_period_start} → ${test_period_end}.` : null}
          </p>
        </div>
        <Badge variant="warning">Educational only</Badge>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Strategy return" value={formatPercent((cumulative_return_strategy ?? 0) * 100, 2)} tone={cumulative_return_strategy && cumulative_return_strategy >= 0 ? 'up' : 'down'} />
        <Stat label="Buy & hold" value={formatPercent((cumulative_return_buy_hold ?? 0) * 100, 2)} />
        <Stat label="vs Buy & hold" value={formatPercent(alpha * 100, 2)} tone={alpha >= 0 ? 'up' : 'down'} />
        <Stat label="Max drawdown" value={formatPercent((max_drawdown_strategy ?? 0) * 100, 2)} tone="down" />
        <Stat label="Trades" value={String(trades ?? 0)} />
        <Stat label="Hit rate (in-market)" value={hit_rate_when_in_market != null ? `${(hit_rate_when_in_market * 100).toFixed(1)}%` : '—'} />
      </dl>

      <p className="mt-4 text-[11px] text-slate-500">
        Transaction cost: {cost_bps_per_side} bps per side. Educational
        historical simulation. Past performance does not guarantee future results.
      </p>
    </GlassCard>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
}) {
  const toneClass =
    tone === 'up'
      ? 'text-[#00FFB2]'
      : tone === 'down'
        ? 'text-red-400'
        : 'text-slate-200'
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}
