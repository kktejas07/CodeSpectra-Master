'use client'

/**
 * Shared empty state with a brand spot illustration (components/illustrations).
 * Pass `illustration` to match the subject (e.g. 'certificate', 'jobs');
 * otherwise the variant picks one.
 * Call only when the list is empty — parent data drives show/hide.
 */
import Link from 'next/link'
import { Illustration, type IllustrationName } from '@/components/illustrations/spot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateVariant =
  | 'default'
  | 'bookmarks'
  | 'search'
  | 'notifications'
  | 'sessions'
  | 'courses'

const VARIANT_ART: Record<EmptyStateVariant, IllustrationName> = {
  default: 'inbox',
  bookmarks: 'bookmarks',
  search: 'search',
  notifications: 'notifications',
  sessions: 'calendar',
  courses: 'courses',
}

type EmptyStateProps = {
  /** Subject-specific spot illustration; defaults from `variant`. */
  illustration?: IllustrationName
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
  illustration,
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
      <Illustration name={illustration ?? VARIANT_ART[variant] ?? 'inbox'} className={compact ? 'mb-2 w-28' : 'mb-5 w-48 md:w-56'} />

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
