'use client'

/**
 * Shared dashboard empty state with the brand vector (components/visuals/empty-art).
 * Call only when the list is empty — parent data drives show/hide.
 */
import Link from 'next/link'
import { EmptyArt } from '@/components/visuals/empty-art'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateVariant =
  | 'default'
  | 'bookmarks'
  | 'search'
  | 'notifications'
  | 'sessions'
  | 'courses'

type EmptyStateProps = {
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  variant?: EmptyStateVariant
  /** Smaller padding, art and title — for use inside tables and panels. */
  compact?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = 'default',
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        compact
          ? 'px-4 py-8'
          : 'rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-12 md:py-16',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <EmptyArt variant={variant} className={compact ? '-my-4 mb-0 scale-[0.65]' : 'mb-6'} />

      <h3 className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-base' : 'text-xl')}>{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}

      {actionLabel ? (
        <div className={compact ? 'mt-4' : 'mt-6'}>
          {actionHref ? (
            <Button asChild variant="default" className="rounded-full px-6">
              <Link href={actionHref}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button type="button" variant="default" className="rounded-full px-6" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
