'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, Code, Lightbulb, AlertTriangle, Info, CheckCircle, Clock, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EbookPage } from '@/lib/db/ebooks'
import { useT } from '@/lib/i18n/client'

function PageBody({ page }: { page: EbookPage }) {
  const { t: tr } = useT()
  if (page.type === 'image' || page.imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.imageUrl!}
          alt={page.imageAlt || page.title || tr('learning.pageImage')}
          className="max-h-full max-w-full rounded-md object-contain shadow-sm"
        />
      </div>
    )
  }

  if (page.type === 'cover') {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 px-6 text-center">
        <p className="text-xs font-semibold text-primary">CodeSpectra</p>
        <h2 className="text-3xl font-bold leading-tight">{page.title}</h2>
        {page.subtitle ? <p className="max-w-md text-muted-foreground">{page.subtitle}</p> : null}
      </div>
    )
  }

  if (page.type === 'toc') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title || tr('learning.contents')}</h3>
        <ul className="space-y-3">
          {(page.items || []).map((it, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 text-xs font-bold text-primary">{it.label}</span>
              <span className="text-sm leading-snug">{it.text}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (page.type === 'compare') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        <div className="grid grid-cols-2 gap-4">
          {page.left && (
            <div className="space-y-2 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">{page.left.title}</p>
              <ul className="space-y-1">
                {page.left.points.map((pt, i) => (
                  <li key={i} className="text-xs leading-relaxed">{pt}</li>
                ))}
              </ul>
            </div>
          )}
          {page.right && (
            <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{page.right.title}</p>
              <ul className="space-y-1">
                {page.right.points.map((pt, i) => (
                  <li key={i} className="text-xs leading-relaxed">{pt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (page.type === 'stats') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        {page.stats && (
          <div className="grid grid-cols-3 gap-3">
            {page.stats.map((s, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold tabular-nums text-primary">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {page.items && (
          <ul className="space-y-2">
            {page.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span><strong>{it.text}</strong></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (page.type === 'journey') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        <div className="space-y-3">
          {(page.steps || []).map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // NEW: Infographic page
  if (page.type === 'infographic') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        {page.stats && (
          <div className="grid grid-cols-2 gap-3">
            {page.stats.map((s, i) => (
              <div key={i} className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 text-center">
                <p className="text-3xl font-bold tabular-nums text-primary">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {page.body && <p className="text-sm text-muted-foreground">{page.body}</p>}
        {page.bullets && (
          <ul className="space-y-2">
            {page.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // NEW: Code page
  if (page.type === 'code') {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="text-xl font-semibold">{page.title}</h3>
        </div>
        {page.body && <p className="text-sm text-muted-foreground">{page.body}</p>}
        {page.code && (
          <div className="rounded-xl bg-neutral-900 p-4 overflow-x-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{page.code}</pre>
          </div>
        )}
        {page.language && (
          <p className="text-xs text-muted-foreground text-right">{tr('learning.languageLanguage', { language: page.language })}</p>
        )}
      </div>
    )
  }

  // NEW: Quiz page
  if (page.type === 'quiz') {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="text-xl font-semibold">{page.title || tr('learning.quizTime')}</h3>
        </div>
        {(page.questions || []).map((q, qi) => (
          <div key={qi} className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-semibold">Q{qi + 1}: {q.question}</p>
            <div className="space-y-1">
              {q.options.map((opt, oi) => (
                <div key={oi} className={cn(
                  "text-xs px-2 py-1 rounded",
                  oi === q.correct ? "bg-green-500/15 text-green-800 dark:text-green-300" : "bg-muted/50"
                )}>
                  {String.fromCharCode(65 + oi)}. {opt}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">💡 {q.explanation}</p>
          </div>
        ))}
      </div>
    )
  }

  // NEW: Timeline page
  if (page.type === 'timeline') {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="text-xl font-semibold">{page.title}</h3>
        </div>
        <div className="relative space-y-4 pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-primary/25" />
          {(page.timeline || []).map((t, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-4 top-1 h-3 w-3 rounded-full bg-primary" />
              <div>
                <p className="text-xs font-bold tabular-nums text-primary">{t.year}</p>
                <p className="text-sm font-semibold">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // NEW: Callout page
  if (page.type === 'callout') {
    const icons = { tip: Lightbulb, warning: AlertTriangle, info: Info, success: CheckCircle }
    const colors = {
      tip: 'border-primary/20 bg-primary/5 text-primary',
      warning: 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400',
      info: 'border-border bg-muted/40 text-foreground',
      success: 'border-green-500/25 bg-green-500/5 text-green-700 dark:text-green-400',
    }
    const Icon = icons[page.calloutType || 'info']
    const colorClass = colors[page.calloutType || 'info']
    return (
      <div className="space-y-4 p-4">
        <div className={cn("rounded-xl border p-4", colorClass)}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className="h-5 w-5" />
            <h3 className="text-lg font-semibold">{page.title}</h3>
          </div>
          {page.body && <p className="text-sm">{page.body}</p>}
          {page.bullets && (
            <ul className="mt-2 space-y-1">
              {page.bullets.map((b, i) => (
                <li key={i} className="text-sm">• {b}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // Default: section / tips / fallback
  return (
    <div className="space-y-4 p-4">
      {page.title && <h3 className="text-xl font-semibold">{page.title}</h3>}
      {page.body && <p className="text-sm leading-relaxed text-muted-foreground">{page.body}</p>}
      {page.bullets && (
        <ul className="space-y-2">
          {page.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {page.quote && (
        <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
          {page.quote}
          {page.quoteBy && <cite className="mt-1 block text-xs not-italic">— {page.quoteBy}</cite>}
        </blockquote>
      )}
    </div>
  )
}

interface FlipbookViewerProps {
  pages: EbookPage[]
  title?: string
  onExportPdf?: () => Promise<void>
}

export function FlipbookViewer({ pages, title, onExportPdf }: FlipbookViewerProps) {
  const { t } = useT()
  const [current, setCurrent] = useState(0)
  const [exporting, setExporting] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)

  const prev = () => setCurrent(c => Math.max(0, c - 1))
  const next = () => setCurrent(c => Math.min(pages.length - 1, c + 1))

  const handleExportPdf = useCallback(async () => {
    if (!onExportPdf) return
    setExporting(true)
    try {
      await onExportPdf()
    } finally {
      setExporting(false)
    }
  }, [onExportPdf])

  if (!pages.length) return null

  const leftPage = pages[current]
  const rightPage = pages[current + 1]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground">
          {title && <span className="font-medium text-foreground">{title}</span>}
          {title && ' · '}{t('learning.page')}{' '}{current + 1}{' '}{t('learning.ofCount', { count: pages.length })}</p>
        <div className="flex items-center gap-2">
          {onExportPdf && (
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}{t('learning.downloadPdf')}</Button>
          )}
          <Button variant="outline" size="sm" onClick={prev} disabled={current === 0} aria-label={t('learning.previousPage')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={next} disabled={current >= pages.length - 1} aria-label={t('learning.nextPage')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Book spread */}
      <div ref={viewerRef} className="flex justify-center">
        <div className="flex gap-1">
          {/* Cover page (centered on desktop) */}
          {current === 0 && (
            <div className="hidden lg:block">
              <div className="flex h-[420px] w-[300px] items-center justify-center rounded-2xl border border-border/60 bg-card text-card-foreground shadow-lg dark:shadow-none">
                <PageBody page={leftPage} />
              </div>
            </div>
          )}

          {/* Left page */}
          {current > 0 && (
            <div className="hidden lg:block">
              <div className="flex h-[420px] w-[300px] items-center justify-center rounded-l-2xl border border-r-0 border-border/60 bg-card text-card-foreground shadow-lg dark:shadow-none">
                <PageBody page={leftPage} />
              </div>
            </div>
          )}

          {/* Right page (or single page on mobile) */}
          <div>
            <div className="flex h-[420px] w-[min(300px,calc(100vw-3rem))] sm:w-[340px] items-center justify-center rounded-2xl border border-border/60 bg-card text-card-foreground shadow-lg dark:shadow-none lg:rounded-r-2xl lg:rounded-l-none">
              <PageBody page={rightPage || leftPage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
