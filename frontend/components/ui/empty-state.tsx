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
  className?: string
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = 'default',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center md:py-16',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <EmptyArt variant={variant} className="mb-6" />

      <h3 className="text-xl font-semibold tracking-tight text-foreground">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}

      {actionLabel ? (
        <div className="mt-6">
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
