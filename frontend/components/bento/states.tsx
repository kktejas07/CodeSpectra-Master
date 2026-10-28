import Link from 'next/link'
import { cn } from '@/lib/utils'
import { BentoCard } from './card'
import type { BentoLayout } from './grid'

/**
 * Loading and empty states sized like the cards they stand in for, so the
 * grid never jumps when data arrives. Labels come from the caller (i18n).
 */

export function SkeletonBar({ className }: { className?: string }) {
  return <span aria-hidden className={cn('bento-skel block rounded-md', className)} />
}

/** A whole card placeholder (well + lines). */
export function BentoSkeleton({ label, well = true, lines = 2, className, ...layout }: BentoLayout & { label: string; well?: boolean; lines?: number; className?: string }) {
  return (
    <BentoCard {...layout} as="div" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {well && <span aria-hidden className="bento-skel block h-28 rounded-[20px]" />}
      <div className="space-y-2 px-3 pb-3 pt-4 sm:px-4 sm:pb-4">
        <SkeletonBar className="h-4 w-2/5" />
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonBar key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
        ))}
      </div>
    </BentoCard>
  )
}

/** Inline empty / error message inside a card body: what's missing and what to do next. */
export function BentoEmpty({
  title,
  text,
  actionLabel,
  actionHref,
  onAction,
  tone = 'empty',
  className,
}: {
  title: string
  text?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  tone?: 'empty' | 'error'
  className?: string
}) {
  const btn = 'inline-flex min-h-9 items-center rounded-full border border-border bg-background px-3.5 text-sm font-medium text-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cn('flex flex-col items-start gap-1', className)}>
      <p className={cn('text-sm font-medium', tone === 'error' ? 'text-destructive' : 'text-foreground')}>{title}</p>
      {text && <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref} className={cn(btn, 'mt-2')}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button type="button" onClick={onAction} className={cn(btn, 'mt-2')}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
