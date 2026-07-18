import { Badge } from '@/components/common/Badge'
import { cn } from '@/lib/utils/cn'
import type { BacktestSummary as BacktestData } from '../api/types'
import { formatPercent } from '../utils/format'

interface BacktestSummaryProps {
  backtest?: BacktestData
}

export function BacktestSummary({ backtest }: BacktestSummaryProps) {
  if (!backtest || !backtest.available) {
    return (
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Educational simulation
          </p>
          <Badge variant="neutral">1-day model only</Badge>
        </div>
        <p className="mt-4 text-sm text-slate-400">
          {backtest?.reason === 'no_holdout_predictions'
            ? 'No holdout predictions available to backtest yet.'
            : 'Backtest is not applicable for this horizon.'}
        </p>
      </div>
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
    n_days,
  } = backtest

  const alpha =
    (cumulative_return_strategy ?? 0) - (cumulative_return_buy_hold ?? 0)
  const strategyWins = alpha >= 0

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Educational simulation
          </p>
          <p className="mt-2 max-w-xl text-sm text-slate-300">
            The simulation holds SPY when the one-day up probability reaches{' '}
            <span className="font-semibold text-white">
              {threshold != null ? (threshold * 100).toFixed(0) : '—'}%
            </span>{' '}
            and otherwise remains in cash. It uses only out-of-sample,
            walk-forward predictions.
          </p>
        </div>
        <Badge variant="warning">Educational only</Badge>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Strategy return"
          value={formatPercent((cumulative_return_strategy ?? 0) * 100, 2)}
          tone={
            cumulative_return_strategy != null && cumulative_return_strategy >= 0
              ? 'up'
              : 'down'
          }
        />
        <Stat
          label="Buy & hold"
          value={formatPercent((cumulative_return_buy_hold ?? 0) * 100, 2)}
        />
        <Stat
          label="vs Buy & hold"
          value={formatPercent(alpha * 100, 2)}
          tone={strategyWins ? 'up' : 'down'}
        />
        <Stat
          label="Max drawdown"
          value={formatPercent((max_drawdown_strategy ?? 0) * 100, 2)}
          tone="down"
        />
        <Stat label="Trades" value={String(trades ?? 0)} />
        <Stat
          label="Hit rate (in market)"
          value={
            hit_rate_when_in_market != null
              ? `${(hit_rate_when_in_market * 100).toFixed(1)}%`
              : '—'
          }
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {test_period_start ? (
          <span>
            Test period{' '}
            <span className="text-slate-300">
              {test_period_start} → {test_period_end}
            </span>
            {n_days != null ? <> · {n_days} sessions</> : null}
          </span>
        ) : null}
        {cost_bps_per_side != null ? (
          <>
            <span aria-hidden>·</span>
            <span>Transaction cost {cost_bps_per_side} bps / side</span>
          </>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Educational historical simulation. Past performance does not guarantee
        future results.
      </p>
    </div>
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
        : 'text-slate-100'
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('mt-1 text-base font-semibold', toneClass)}>{value}</p>
    </div>
  )
}
