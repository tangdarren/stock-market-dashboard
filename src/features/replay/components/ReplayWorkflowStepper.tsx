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

const PHASE_INSTRUCTIONS: Record<ReplayWorkflowPhase, string> = {
  reviewing: 'Review the session below, then continue to your prediction.',
  configuring: 'Choose a horizon and direction, adjust confidence if needed, then lock your prediction.',
  locked: 'Your prediction is locked. Reveal the outcome when you are ready.',
  revealed: 'Compare your forecast with the model and the realized outcome.',
}

interface ReplayWorkflowStepperProps {
  phase: ReplayWorkflowPhase
}

export function ReplayWorkflowStepper({ phase }: ReplayWorkflowStepperProps) {
  const activeIndex = PHASE_ORDER.indexOf(phase)

  return (
    <nav aria-label="Prediction workflow" className="w-full space-y-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex
          const isComplete = index < activeIndex
          return (
            <li
              key={step.id}
              aria-current={isActive ? 'step' : undefined}
              data-state={isActive ? 'active' : isComplete ? 'complete' : 'upcoming'}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                isActive &&
                  'border-[#00FFB2]/70 bg-[#00FFB2]/20 shadow-[inset_0_0_0_1px_rgba(0,255,178,0.25)]',
                isComplete &&
                  !isActive &&
                  'border-[#00FFB2]/25 bg-[#00FFB2]/[0.06]',
                !isActive &&
                  !isComplete &&
                  'border-white/[0.08] bg-white/[0.02] opacity-70',
              )}
            >
              <p
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.14em]',
                  isActive
                    ? 'text-[#00FFB2]'
                    : isComplete
                      ? 'text-[#00FFB2]/70'
                      : 'text-slate-500',
                )}
              >
                {isActive ? 'Current step' : isComplete ? 'Completed' : `Step ${index + 1}`}
              </p>
              <p
                className={cn(
                  'mt-1 text-sm font-medium',
                  isActive
                    ? 'text-white'
                    : isComplete
                      ? 'text-slate-200'
                      : 'text-slate-500',
                )}
              >
                {step.label}
              </p>
            </li>
          )
        })}
      </ol>
      <p className="text-sm text-slate-300" data-testid="workflow-instruction">
        {PHASE_INSTRUCTIONS[phase]}
      </p>
    </nav>
  )
}
