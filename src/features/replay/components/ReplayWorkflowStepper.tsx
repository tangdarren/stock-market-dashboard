import { cn } from '@/lib/utils/cn'
import type { ReplayWorkflowPhase } from '../utils/prediction'

const STEPS: { id: ReplayWorkflowPhase; label: string }[] = [
  { id: 'reviewing', label: 'Review session' },
  { id: 'configuring', label: 'Configure prediction' },
  { id: 'locked', label: 'Prediction locked' },
  { id: 'revealed', label: 'Outcome revealed' },
]

const PHASE_ORDER: ReplayWorkflowPhase[] = [
  'reviewing',
  'configuring',
  'locked',
  'revealed',
]

interface ReplayWorkflowStepperProps {
  phase: ReplayWorkflowPhase
}

export function ReplayWorkflowStepper({ phase }: ReplayWorkflowStepperProps) {
  const activeIndex = PHASE_ORDER.indexOf(phase)

  return (
    <nav aria-label="Prediction workflow" className="w-full">
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex
          const isComplete = index < activeIndex
          return (
            <li
              key={step.id}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                isActive && 'border-[#00FFB2]/40 bg-[#00FFB2]/10',
                isComplete && !isActive && 'border-white/[0.08] bg-white/[0.03]',
                !isActive && !isComplete && 'border-white/[0.06] bg-transparent',
              )}
            >
              <p
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.14em]',
                  isActive ? 'text-[#00FFB2]' : 'text-slate-500',
                )}
              >
                Step {index + 1}
              </p>
              <p
                className={cn(
                  'mt-1 text-sm font-medium',
                  isActive ? 'text-white' : isComplete ? 'text-slate-300' : 'text-slate-500',
                )}
              >
                {step.label}
              </p>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
