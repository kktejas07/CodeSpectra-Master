'use client'

/** Public contest listing with a format filter. */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Users } from 'lucide-react'
import { PageHero, btnPrimary, btnSecondary } from '@/components/landing/page-hero'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { FORMATS, FORMAT_LIST } from '@/lib/contests/formats'
import type { ContestFormat, ContestPhase } from '@/lib/contests/types'
import { FormatIcon, PhaseBadge, fmtWhen } from './shared'

export interface ContestCard {
  id: string; slug: string; title: string; summary: string; format: ContestFormat; phase: ContestPhase
  starts_at: string; ends_at: string; timezone: string; mode: 'solo' | 'team'; team_max: number; prize_text: string
}

export function ContestsList({ items }: { items: ContestCard[] | null }) {
  const [format, setFormat] = useState<ContestFormat | 'all'>('all')
  const shown = useMemo(() => (items || []).filter((c) => format === 'all' || c.format === format), [items, format])
  const present = new Set((items || []).map((c) => c.format))

  return (
    <>
      <PageHero
        title="Contests"
        lead="CTFs, datathons, prompt-a-thons, debug-a-thons, code golf, ideathons, system design jams and open-source sprints, hosted on CodeSpectra with live leaderboards and verifiable certificates."
        actions={
          <>
            <a href="#listings" className={btnPrimary}>See contests</a>
            <Link href="/contact?topic=pilot" className={btnSecondary}>Host one on CodeSpectra</Link>
          </>
        }
      />
      <div id="listings" className="mx-auto max-w-[1200px] scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8">
        {items === null ? (
          <EmptyState className="mx-auto max-w-xl" illustration="error" title="We couldn’t load contests" description="Refresh the page in a moment." />
        ) : items.length === 0 ? (
          <EmptyState
            className="mx-auto max-w-xl" illustration="hackathon"
            title="No contests open right now"
            description="Create a free account and you’ll see new contests on your dashboard as soon as they open."
            actionLabel="Create a free account" actionHref="/auth/signup"
          />
        ) : (
          <>
            <div role="group" aria-label="Filter by format" className="mb-6 flex flex-wrap gap-2">
              {(['all', ...FORMAT_LIST.map((f) => f.id).filter((f) => present.has(f))] as const).map((f) => (
                <button
                  key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}
                  className={cn('min-h-10 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    format === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40')}
                >
                  {f === 'all' ? 'All formats' : FORMATS[f].label}
                </button>
              ))}
            </div>
            <div className="cs-stagger grid gap-5 md:grid-cols-2">
              {shown.map((c) => (
                <Link
                  key={c.id} href={`/contests/${c.slug}`}
                  className="group rounded-3xl border border-border/70 bg-card p-6 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                      <FormatIcon format={c.format} className="h-4 w-4" /> {FORMATS[c.format].label}
                    </span>
                    <PhaseBadge phase={c.phase} />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">{c.title}</h2>
                  {c.summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p>}
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden /> {fmtWhen(c.starts_at, c.timezone)}</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden /> {c.mode === 'team' ? `Teams up to ${c.team_max}` : 'Solo'}</span>
                    {c.prize_text && <span>{c.prize_text}</span>}
                  </div>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    View contest <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
