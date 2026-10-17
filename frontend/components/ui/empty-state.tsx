'use client'

/**
 * Shared dashboard empty state.
 * - Primary: free Lottie Simple License animation (vendored under /public/lottie)
 * - Fallback: Iconoir MIT SVG if Lottie fails
 * Call only when the list is empty — parent data drives show/hide.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Lottie } from 'lottie-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateVariant =
  | 'default'
  | 'bookmarks'
  | 'search'
  | 'notifications'
  | 'sessions'
  | 'courses'

const LOTTIE_SRC: Record<EmptyStateVariant, string> = {
  default: '/lottie/empty-state.json',
  bookmarks: '/lottie/empty-state.json',
  search: '/lottie/empty-search.json',
  notifications: '/lottie/empty-state.json',
  sessions: '/lottie/empty-state.json',
  courses: '/lottie/empty-search.json',
}

const SVG_FALLBACK: Record<EmptyStateVariant, string> = {
  default: '/illustrations/empty-page.svg',
  bookmarks: '/illustrations/bookmark.svg',
  search: '/illustrations/search-engine.svg',
  notifications: '/illustrations/mail.svg',
  sessions: '/illustrations/open-book.svg',
  courses: '/illustrations/folder.svg',
}

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
  const [failed, setFailed] = useState(false)
  const src = LOTTIE_SRC[variant]

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center md:py-16',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="relative mb-6 flex h-44 w-44 items-center justify-center md:h-56 md:w-56">
        {!failed ? (
          <Lottie
            key={src}
            src={src}
            autoplay
            loop
            className="h-full w-full"
            aria-hidden
            subscriptions={{
              error: () => setFailed(true),
            }}
          />
        ) : (
          // Iconoir MIT SVG — professional line art, theme-colored via CSS
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={SVG_FALLBACK[variant]}
            alt=""
            className="h-28 w-28 opacity-70 filter-[invert(0.45)] dark:filter-[invert(0.85)]"
          />
        )}
      </div>

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
