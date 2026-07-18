import { useMemo, useState } from 'react'
import { Badge } from '@/components/common/Badge'
import { GlassCard } from '@/features/ui/components/GlassCard'
import type { HorizonMetrics, MetricsResponse } from '../api/types'
import { cn } from '@/lib/utils/cn'
import { buildPerformanceSummary } from '../utils/performanceSummary'
import { CalibrationPanel } from './CalibrationPanel'
import { ConfusionMatrix } from './ConfusionMatrix'
import { ModelComparisonTable } from './ModelComparisonTable'

interface ModelPerformancePanelProps {
  metrics?: MetricsResponse
}

type TabId = 'baselines' | 'comparison' | 'confusion' | 'calibration' | 'yearly' | 'buckets'

const TABS: { id: TabId; label: string; description: string }[] = [
  {
    id: 'baselines',
    label: 'Baselines',
    description: 'Selected model side-by-side with majority-class and persistence baselines.',
  },
  {
    id: 'comparison',
    label: 'Model comparison',
    description: 'Cross-validation scores for every candidate model considered.',
  },
  {
    id: 'confusion',
    label: 'Confusion matrix',
    description: 'Where the model gets directions right and where it does not.',
  },
  {
    id: 'calibration',
    label: 'Calibration',
    description: 'Are the model\u2019s probabilities honest?',
  },
  {
    id: 'yearly',
    label: 'By year',
    description: 'Holdout accuracy broken out by calendar year.',
  },
  {
    id: 'buckets',
    label: 'By confidence',
    description: 'How accuracy tracks the model\u2019s stated confidence.',
  },
]

export function ModelPerformancePanel({ metrics }: ModelPerformancePanelProps) {
  const horizons = useMemo(() => Object.keys(metrics?.horizons ?? {}), [metrics])
  const [horizonKey, setHorizonKey] = useState<string>(horizons[0] ?? '1d')
  const [tab, setTab] = useState<TabId>('baselines')

  if (!metrics || horizons.length === 0) {
    return (
      <GlassCard className="p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Model performance
        </p>
        <p className="mt-6 text-sm text-slate-400">
          No metrics artifact yet. Train the models via{' '}
          <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300">
            python server/scripts/train_models.py
          </code>
          .
        </p>
      </GlassCard>
    )
  }

  const active = metrics.horizons[horizonKey] as HorizonMetrics | undefined
  const holdout = active?.holdout
  const summary = buildPerformanceSummary(
    active,
    horizonKey === '1d' ? 'one-day model' : `${horizonKey} model`,
  )
  const activeTab = TABS.find((t) => t.id === tab)!

  const summaryVariant =
    summary?.verdict === 'beats'
      ? 'success'
      : summary?.verdict === 'weak'
        ? 'danger'
        : 'neutral'

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Out-of-sample holdout evaluation
          </p>
          <h3 className="text-base font-semibold text-white">
            Selected model: {formatModelName(active?.selected_model ?? '—')}
          </h3>
          {holdout ? (
            <p className="text-xs text-slate-500">
              Test period {holdout.test_period_start} → {holdout.test_period_end} · N=
              {holdout.n_observations} sessions
            </p>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label="Forecast horizon"
          className="flex gap-2"
        >
          {horizons.map((h) => (
            <button
              key={h}
              type="button"
              role="tab"
              aria-selected={horizonKey === h}
              onClick={() => setHorizonKey(h)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                horizonKey === h
                  ? 'border-[#00FFB2]/40 bg-[#00FFB2]/10 text-[#00FFB2]'
                  : 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.06]',
              )}
            >
              {h.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {summary ? (
        <div className="mt-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={summaryVariant}>
              {summary.verdict === 'beats'
                ? 'Beats baseline'
                : summary.verdict === 'weak'
                  ? 'Below baseline'
                  : summary.verdict === 'matches'
                    ? 'Close to baseline'
                    : 'Baseline unknown'}
            </Badge>
            <p
              className="text-sm font-medium text-slate-100"
              data-testid="performance-summary-headline"
            >
              {summary.headline}
            </p>
          </div>
          <p className="mt-2 text-xs text-slate-400">{summary.body}</p>
        </div>
      ) : null}

      {holdout ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricPill label="Accuracy" value={holdout.accuracy} />
          <MetricPill label="Balanced acc" value={holdout.balanced_accuracy} />
          <MetricPill label="ROC-AUC" value={holdout.roc_auc} />
          <MetricPill label="Brier" value={holdout.brier} />
          <MetricPill label="Precision (up)" value={holdout.precision_up} />
          <MetricPill label="Recall (up)" value={holdout.recall_up} />
        </dl>
      ) : null}

      <div className="mt-6 border-b border-white/[0.05]">
        <nav className="-mx-2 flex flex-wrap gap-1 px-2" role="tablist" aria-label="Detailed analytics">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`perf-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`perf-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00FFB2]/60',
                tab === t.id
                  ? 'border-[#00FFB2] text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-300',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div
        role="tabpanel"
        id={`perf-panel-${activeTab.id}`}
        aria-labelledby={`perf-tab-${activeTab.id}`}
        className="mt-4"
      >
        <p className="mb-4 text-xs text-slate-500">{activeTab.description}</p>
        {active && tab === 'comparison' ? (
          <ModelComparisonTable rows={active.model_comparison} selected={active.selected_model} />
        ) : null}
        {active && tab === 'baselines' ? (
          <BaselinesTable baselines={active.baselines} holdout={active.holdout} />
        ) : null}
        {active && tab === 'confusion' ? (
          <ConfusionMatrix matrix={active.holdout.confusion_matrix} />
        ) : null}
        {active && tab === 'calibration' ? (
          <CalibrationPanel points={active.calibration} />
        ) : null}
        {active && tab === 'yearly' ? <YearlyTable rows={active.yearly} /> : null}
        {active && tab === 'buckets' ? <BucketsTable rows={active.confidence_buckets} /> : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge variant="neutral">Chronological holdout</Badge>
        <Badge variant="neutral">TimeSeriesSplit CV</Badge>
        <Badge variant="neutral">No look-ahead features</Badge>
      </div>
    </GlassCard>
  )
}

function formatModelName(name: string): string {
  if (!name || name === '—') return '—'
  return name
    .split(/[_\s]+/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' ')
}

function MetricPill({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">
        {value == null || Number.isNaN(value) ? '—' : value.toFixed(3)}
      </p>
    </div>
  )
}

function BaselinesTable({
  baselines,
  holdout,
}: {
  baselines: HorizonMetrics['baselines']
  holdout: HorizonMetrics['holdout']
}) {
  const rows = [
    { name: 'Selected model', m: holdout },
    ...Object.entries(baselines).map(([name, m]) => ({ name, m })),
  ]
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
      <table className="min-w-full divide-y divide-white/[0.06] text-sm">
        <thead className="bg-white/[0.02] text-left">
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Predictor</th>
            <th className="px-4 py-3 text-right font-medium">Accuracy</th>
            <th className="px-4 py-3 text-right font-medium">Balanced acc</th>
            <th className="px-4 py-3 text-right font-medium">ROC-AUC</th>
            <th className="px-4 py-3 text-right font-medium">Brier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map(({ name, m }) => (
            <tr key={name}>
              <td className="px-4 py-3 text-slate-100">{name}</td>
              <td className="px-4 py-3 text-right text-slate-300">{m.accuracy.toFixed(3)}</td>
              <td className="px-4 py-3 text-right text-slate-300">{m.balanced_accuracy.toFixed(3)}</td>
              <td className="px-4 py-3 text-right text-slate-300">
                {m.roc_auc == null ? '—' : m.roc_auc.toFixed(3)}
              </td>
              <td className="px-4 py-3 text-right text-slate-300">{m.brier.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YearlyTable({ rows }: { rows: HorizonMetrics['yearly'] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Not enough calendar years in the holdout.</p>
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
      <table className="min-w-full divide-y divide-white/[0.06] text-sm">
        <thead className="bg-white/[0.02] text-left">
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3 text-right">N</th>
            <th className="px-4 py-3 text-right">Accuracy</th>
            <th className="px-4 py-3 text-right">Balanced acc</th>
            <th className="px-4 py-3 text-right">ROC-AUC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="px-4 py-3 text-slate-100">{r.year}</td>
              <td className="px-4 py-3 text-right text-slate-300">{r.n}</td>
              <td className="px-4 py-3 text-right text-slate-300">{r.accuracy.toFixed(3)}</td>
              <td className="px-4 py-3 text-right text-slate-300">{r.balanced_accuracy.toFixed(3)}</td>
              <td className="px-4 py-3 text-right text-slate-300">
                {r.roc_auc == null ? '—' : r.roc_auc.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BucketsTable({ rows }: { rows: HorizonMetrics['confidence_buckets'] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
      <table className="min-w-full divide-y divide-white/[0.06] text-sm">
        <thead className="bg-white/[0.02] text-left">
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Bucket</th>
            <th className="px-4 py-3">Confidence range</th>
            <th className="px-4 py-3 text-right">N</th>
            <th className="px-4 py-3 text-right">Accuracy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r) => (
            <tr key={r.bucket}>
              <td className="px-4 py-3 capitalize text-slate-100">{r.bucket}</td>
              <td className="px-4 py-3 text-slate-400">
                {(r.confidence_range[0] * 100).toFixed(0)}%&ndash;{(r.confidence_range[1] * 100).toFixed(0)}%
              </td>
              <td className="px-4 py-3 text-right text-slate-300">{r.n}</td>
              <td className="px-4 py-3 text-right text-slate-300">
                {r.accuracy == null ? '—' : r.accuracy.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
