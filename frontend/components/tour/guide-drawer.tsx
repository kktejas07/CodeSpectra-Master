'use client'

import { useEffect, useRef } from 'react'
import { X, BookOpenText, Sparkles, Lightbulb, Play } from 'lucide-react'
import { GUIDE_CONTENT } from '@/components/tour/guide-content'
import { replayPageTour, hasRegisteredTour } from '@/lib/tour-driver'
import { cn } from '@/lib/utils'

interface GuideDrawerProps {
  open: boolean
  onClose: () => void
  /** Tour id resolved for the current path (null when the page has no guide). */
  tourId: string | null
  /** Human-readable page name used when no guide content exists. */
  fallbackTitle?: string
}

/**
 * Unstop-style page guide: a panel sliding in from the right with
 * what-this-page-is, its features with how-to-use text, and practical tips —
 * plus a button to replay the spotlight tour when the page has one.
 */
export function GuideDrawer({ open, onClose, tourId, fallbackTitle = 'Guide' }: GuideDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const content = tourId ? GUIDE_CONTENT[tourId] : undefined
  const canTour = !!tourId && hasRegisteredTour(tourId)

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const title = content?.title ?? fallbackTitle

  return (
    <>
      <div
        className="fixed inset-0 z-[1001] bg-black/50 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${title} guide`}
        className={cn(
          'fixed right-0 top-0 z-[1002] flex h-full w-[380px] max-w-[92vw] flex-col',
          'border-l border-border bg-card shadow-2xl',
          'motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BookOpenText className="h-4.5 w-4.5 text-primary" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Explanation &amp; Tips
              </p>
              <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {content ? (
            <>
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What is this page
                </h3>
                <p className="text-sm leading-relaxed text-foreground">{content.about}</p>
              </section>

              {content.features.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Features on this page
                  </h3>
                  <ul className="space-y-3">
                    {content.features.map((f) => (
                      <li key={f.title} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                        <p className="text-sm font-semibold text-foreground">{f.title}</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                          {f.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {content.tips.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5" /> Tips
                  </h3>
                  <ul className="space-y-2">
                    {content.tips.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground">
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <section>
              <p className="text-sm leading-relaxed text-muted-foreground">
                No written guide exists for this page yet. Use the sidebar to explore,
                or run the interactive tour when one is available.
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 p-4">
          {canTour && tourId ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                // Small delay so the drawer unmounts before the spotlight takes over.
                setTimeout(() => replayPageTour(tourId), 150)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Play className="h-4 w-4" />
              Take the guided tour
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Got it
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
