import { GlassCard } from '@/features/ui/components/GlassCard'
import { cn } from '@/lib/utils/cn'

interface SkeletonProps {
  className?: string
  height?: string
}

export function SkeletonBlock({ className, height = 'h-6' }: SkeletonProps) {
  return (
    <div
      className={cn(
        'w-full animate-pulse rounded-lg bg-white/[0.04]',
        height,
        className,
      )}
    />
  )
}

export function ForecastSkeleton() {
  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <SkeletonBlock height="h-4" className="w-24" />
        <SkeletonBlock height="h-10" className="mt-3 w-2/3" />
        <SkeletonBlock height="h-4" className="mt-4 w-1/2" />
      </GlassCard>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard className="p-6">
          <SkeletonBlock height="h-32" />
        </GlassCard>
        <GlassCard className="p-6">
          <SkeletonBlock height="h-32" />
        </GlassCard>
      </div>
      <GlassCard className="p-6">
        <SkeletonBlock height="h-56" />
      </GlassCard>
    </div>
  )
}
