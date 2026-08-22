'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
        <div className="grid gap-3 sm:grid-cols-2">
          {[page.left, page.right].filter(Boolean).map((side, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="mb-2 font-medium">{side!.title}</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {(side!.points || []).map((p, j) => (
                  <li key={j}>• {p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (page.type === 'stats') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        {page.stats?.length ? (
          <div className="grid grid-cols-2 gap-3">
            {page.stats.map((s, i) => (
              <div key={i} className="rounded-lg border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}
        {page.items?.length ? (
          <ul className="space-y-2">
            {page.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="font-semibold text-primary">{it.label}</span>
                <span className="text-muted-foreground">{it.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  if (page.type === 'journey') {
    return (
      <div className="space-y-4 p-4">
        <h3 className="text-xl font-semibold">{page.title}</h3>
        <ol className="space-y-3">
          {(page.steps || []).map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {page.title ? <h3 className="text-xl font-semibold">{page.title}</h3> : null}
      {page.body ? <p className="text-sm leading-relaxed text-muted-foreground">{page.body}</p> : null}
      {page.quote ? (
        <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-foreground/90">
          “{page.quote}”
          {page.quoteBy ? (
            <footer className="mt-1 text-xs not-italic text-muted-foreground">— {page.quoteBy}</footer>
          ) : null}
        </blockquote>
      ) : null}
      {(page.bullets || []).length > 0 ? (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {page.bullets!.map((b, i) => (
            <li key={i}>• {b}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** 
 * Unstop-style 2-page spread Flipbook viewer.
 * On desktop: Cover is centered (1 page). Then 2 pages side-by-side.
 * On mobile: 1 page at a time.
 */
export function FlipbookViewer({ pages }: { pages: EbookPage[] }) {
  const [index, setIndex] = useState(0) // 0 = cover, 1 = spread (pages 1 and 2), 3 = spread (pages 3 and 4), etc.
  const [flipping, setFlipping] = useState(false)
  const total = pages.length

  const go = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= total || flipping) return
    setFlipping(true)
    window.setTimeout(() => {
      setIndex(nextIndex)
      setFlipping(false)
    }, 250)
  }

  if (total === 0) return <p className="text-sm text-muted-foreground">No pages.</p>

  const isCover = index === 0
  const leftPage = isCover ? pages[0] : pages[index]
  const rightPage = isCover ? null : pages[index + 1]
  const canGoNext = isCover ? index + 1 < total : index + 2 < total

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Container scales slightly when flipping */}
      <div
        className={cn(
          'relative flex min-h-[500px] w-full transition-all duration-250',
          flipping ? 'scale-[0.98] opacity-60' : 'scale-100 opacity-100',
        )}
      >
        {/* Left page (or cover, centered on mobile, right on desktop conceptually but usually cover is just one card) */}
        <div
          className={cn(
            'flex-1 rounded-2xl border border-border/60 bg-card shadow-sm transition-all relative overflow-hidden',
            isCover ? 'mx-auto max-w-md' : 'rounded-r-none border-r-0 max-md:rounded-r-2xl max-md:border-r'
          )}
        >
          {leftPage ? <PageBody page={leftPage} /> : null}
          {/* Subtle gradient for book spine on left page */}
          {!isCover && <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-black/10 to-transparent max-md:hidden" />}
        </div>
        
        {/* Right page (hidden on mobile, visible on desktop when not cover) */}
        {!isCover && (
          <div
            className={cn(
              'flex-1 rounded-2xl rounded-l-none border border-border/60 border-l-0 bg-card shadow-sm relative overflow-hidden',
              'max-md:hidden'
            )}
          >
            {rightPage ? <PageBody page={rightPage} /> : (
               <div className="flex h-full w-full items-center justify-center bg-muted/10">
                 <p className="text-muted-foreground text-sm">End of book</p>
               </div>
            )}
            {/* Subtle gradient for book spine on right page */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-black/10 to-transparent" />
          </div>
        )}
      </div>
      
      {/* Navigation Controls */}
      <div className="flex items-center justify-between gap-3 px-4">
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          disabled={index === 0 || flipping} 
          onClick={() => go(isCover ? 0 : index - (index === 1 ? 1 : 2))}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <p className="tabular-nums text-xs font-medium text-muted-foreground">
          {isCover ? 'Cover' : `${index + 1} - ${rightPage ? index + 2 : index + 1} / ${total}`}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoNext || flipping}
          onClick={() => go(isCover ? 1 : index + 2)}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
