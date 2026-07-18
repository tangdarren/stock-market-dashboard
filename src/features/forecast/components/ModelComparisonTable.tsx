import { Badge } from '@/components/common/Badge'
import type { ModelComparisonRow } from '../api/types'

interface ModelComparisonTableProps {
  rows: ModelComparisonRow[]
  selected: string
}

export function ModelComparisonTable({ rows, selected }: ModelComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
      <table className="min-w-full divide-y divide-white/[0.06] text-sm">
        <thead className="bg-white/[0.02] text-left">
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-medium">Model</th>
            <th className="px-4 py-3 text-right font-medium">Mean val ROC-AUC</th>
            <th className="px-4 py-3 text-right font-medium">Mean val Brier</th>
            <th className="px-4 py-3 text-right font-medium">Mean val accuracy</th>
            <th className="px-4 py-3 text-right font-medium">Fold ROC-AUC</th>
            <th className="px-4 py-3 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((row) => {
            const isSelected = row.model_name === selected
            return (
              <tr key={row.model_name} className={isSelected ? 'bg-[#00FFB2]/[0.05]' : ''}>
                <td className="px-4 py-3 font-mono text-slate-100">{row.model_name}</td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {fmt(row.mean_val_roc_auc)}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {fmt(row.mean_val_brier)}
                </td>
                <td className="px-4 py-3 text-right text-slate-300">
                  {fmt(row.mean_val_accuracy)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">
                  {row.fold_roc_auc.map((f) => (f == null ? '—' : f.toFixed(2))).join(' / ')}
                </td>
                <td className="px-4 py-3 text-right">
                  {isSelected ? <Badge variant="success">Selected</Badge> : <span className="text-slate-500">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function fmt(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? '—' : v.toFixed(3)
}
