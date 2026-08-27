'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EbookPage } from '@/lib/db/ebooks'

function PageBody({ page }: { page: EbookPage }) {
  if (page.type === 'image' || page.imageUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-transparent">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={page.imageUrl!}
          alt={page.imageAlt || page.title || 'Page image'}
          className="max-h-full max-w-full rounded-md object-contain shadow-sm"
        />
      </div>
    )
  }

  if (page.type === 'cover') {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-3 px-6 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-primary">CodeSpectra</p>
        <h2 className="text-3xl font-bold leading-tight">{page.title}</h2>
        {page.subtitle ? <p className="max-w-md text-muted-foreground">{page.subtitle}</p> : null}
      </div>
    )
  }

  if (page.type === 'toc') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title || 'Contents'}</h3>
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
            <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-emerald-600">{page.left.title}</p>
              <ul className="space-y-1">
                {page.left.points.map((pt, i) => (
                  <li key={i} className="text-xs leading-relaxed">{pt}</li>
                ))}
              </ul>
            </div>
          )}
          {page.right && (
            <div className="space-y-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <p className="text-sm font-semibold text-rose-600">{page.right.title}</p>
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
              <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{s.value}</p>
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {title && <span className="font-medium text-foreground">{title}</span>}
          {title && ' · '}
          Page {current + 1} of {pages.length}
        </p>
        <div className="flex items-center gap-2">
          {onExportPdf && (
            <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              Download PDF
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={prev} disabled={current === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={next} disabled={current >= pages.length - 1}>
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
              <div className="flex h-[420px] w-[300px] items-center justify-center rounded-lg border border-border/60 bg-card shadow-lg">
                <PageBody page={leftPage} />
              </div>
            </div>
          )}

          {/* Left page */}
          {current > 0 && (
            <div className="hidden lg:block">
              <div className="flex h-[420px] w-[300px] items-center justify-center rounded-l-lg border border-r-0 border-border/60 bg-card shadow-lg">
                <PageBody page={leftPage} />
              </div>
            </div>
          )}

          {/* Right page (or single page on mobile) */}
          <div>
            <div className="flex h-[420px] w-[300px] sm:w-[340px] items-center justify-center rounded-lg border border-border/60 bg-card shadow-lg lg:rounded-r-lg lg:rounded-l-none">
              <PageBody page={rightPage || leftPage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
