import { cn } from '@/lib/utils/cn'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  as?: React.ElementType
}

export function GlassCard({
  children,
  className,
  onClick,
  as: Tag = 'div',
}: GlassCardProps) {
  return (
    <Tag
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] backdrop-blur-sm',
        'shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_4px_32px_rgba(0,0,0,0.4)]',
        onClick && 'cursor-pointer transition-all duration-300 hover:border-white/[0.1] hover:bg-white/[0.06]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </Tag>
  )
}
