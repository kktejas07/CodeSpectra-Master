'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EbookPage } from '@/lib/db/ebooks'

function PageBody({ page }: { page: EbookPage }) {
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
      <div className="space-y-4 p-2">
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
      <div className="space-y-4">
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
      <div className="space-y-4">
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
      <div className="space-y-4">
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
    <div className="space-y-4">
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

/** CSS flipbook — prev/next with light page-turn motion (no heavy deps). */
export function FlipbookViewer({ pages }: { pages: EbookPage[] }) {
  const [index, setIndex] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const page = pages[index]
  const total = pages.length

  function go(next: number) {
    if (next < 0 || next >= total || flipping) return
    setFlipping(true)
    window.setTimeout(() => {
      setIndex(next)
      setFlipping(false)
    }, 180)
  }

  if (!page) return <p className="text-sm text-muted-foreground">No pages.</p>

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div
        className={cn(
          'relative min-h-105 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-200 md:p-8',
          flipping && 'scale-[0.985] -rotate-1 opacity-70',
        )}
      >
        <PageBody page={page} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-3 rounded-r-2xl bg-linear-to-l from-black/5 to-transparent" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" disabled={index === 0 || flipping} onClick={() => go(index - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <p className="tabular-nums text-xs text-muted-foreground">
          {index + 1} / {total}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={index >= total - 1 || flipping}
          onClick={() => go(index + 1)}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
