import { cn } from '@/lib/utils/cn'

interface LoadingStateProps {
  message?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingState({ message = 'Loading…', className, size = 'md' }: LoadingStateProps) {
  const spinnerSize = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }[size]
  const textSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size]

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}>
      <div
        className={cn(
          spinnerSize,
          'animate-spin rounded-full border-2 border-white/10 border-t-sky-500',
        )}
      />
      <p className={cn(textSize, 'text-slate-500')}>{message}</p>
    </div>
  )
}
