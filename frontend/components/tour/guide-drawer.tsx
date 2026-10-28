'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { X, BookOpenText, Sparkles, Lightbulb, Play } from 'lucide-react'
import { GUIDE_CONTENT } from '@/components/tour/guide-content'
import { replayPageTour, hasRegisteredTour } from '@/lib/tour-driver'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/client'

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
  const { t } = useT()
  const closeRef = useRef<HTMLButtonElement>(null)
  const content = tourId ? GUIDE_CONTENT[tourId] : undefined
  const canTour = !!tourId && hasRegisteredTour(tourId)

  // Esc closes, Tab stays inside, focus returns to the opener on close.
  const panelRef = useFocusTrap<HTMLElement>(open, onClose)
  // Lock body scroll while open; start on the close button.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('dash.titleGuide', { title })}
        className={cn(
          'fixed right-0 top-0 z-[1002] flex h-full w-full max-w-[92vw] flex-col sm:w-[380px]',
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
              <p className="text-sm font-medium text-muted-foreground">{t('dash.explanationTips')}</p>
              <h2 className="text-lg font-bold leading-tight text-foreground">{title}</h2>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('dash.closeGuide')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {content ? (
            <>
              <section>
                <h3 className="mb-1.5 text-sm font-medium text-muted-foreground">{t('dash.whatThisPageIsFor')}</h3>
                <p className="text-sm leading-relaxed text-foreground">{content.about}</p>
              </section>

              {content.features.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />{' '}{t('dash.featuresOnThisPage')}</h3>
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
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Lightbulb className="h-3.5 w-3.5" />{' '}{t('dash.tips')}</h3>
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
              <p className="text-sm leading-relaxed text-muted-foreground">{t('dash.noWrittenGuideExistsForThisc60')}</p>
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
              <Play className="h-4 w-4" />{t('dash.takeTheGuidedTour')}</button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >{t('dash.gotIt')}</button>
          )}
        </div>
      </aside>
    </>
  )
}
