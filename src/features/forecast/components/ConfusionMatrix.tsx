interface ConfusionMatrixProps {
  matrix: number[][]
  className?: string
}

const LABELS = ['Actual Down', 'Actual Up']
const PRED = ['Pred. Down', 'Pred. Up']

export function ConfusionMatrix({ matrix, className }: ConfusionMatrixProps) {
  const flat = matrix.flat()
  const max = flat.length > 0 ? Math.max(...flat) : 1
  return (
    <div className={className}>
      <table className="w-full border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th />
            {PRED.map((p) => (
              <th key={p} className="text-slate-500">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={LABELS[i]}>
              <th className="pr-3 text-right text-slate-500">{LABELS[i]}</th>
              {row.map((count, j) => {
                const intensity = max === 0 ? 0 : count / max
                const isDiag = i === j
                const color = isDiag ? '#00FFB2' : '#f97066'
                return (
                  <td
                    key={`${i}-${j}`}
                    className="rounded-lg p-4 font-mono"
                    style={{
                      background: `${hexToRgba(color, 0.05 + intensity * 0.35)}`,
                      color: isDiag ? '#e5fff5' : '#ffe6e6',
                    }}
                  >
                    {count}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
