'use client'

/** Landing page "Upcoming events" strip — hides itself when there's nothing to show. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { formatRange, KIND_LABELS, MODE_LABELS } from '@/lib/events-feed/public'
import type { PublicFeedEvent } from '@/lib/events-feed/types'
import { useT } from '@/lib/i18n/client'
import { useLocalizedHref } from '@/components/i18n/public-language'

export function UpcomingEventsStrip({ initialEvents }: { initialEvents?: PublicFeedEvent[] } = {}) {
  const [events, setEvents] = useState<PublicFeedEvent[] | null>(initialEvents ?? null)
  const { t, td } = useT()
  const lp = useLocalizedHref()
  useEffect(() => {
    // Server-loaded (landing page) — already in the HTML, no client refetch.
    if (initialEvents) return
    let off = false
    fetch('/api/events-feed?limit=6').then((r) => (r.ok ? r.json() : { events: [] })).then((d) => { if (!off) setEvents(d.events || []) }).catch(() => { if (!off) setEvents([]) })
    return () => { off = true }
  }, [initialEvents])
  if (!events?.length) return null
  return (
    <section className="border-b border-cs-grid" aria-labelledby="upcoming-events-title">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-cs-accent-text">{t('public.navEvents')}</p>
            <h2 id="upcoming-events-title" className="cs-heading mt-2 text-3xl sm:text-4xl">{t('public.upcomingTitle')}</h2>
          </div>
          <Link href={lp('/events')} className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-cs-ink hover:underline">{t('public.upcomingAll')} <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
          {events.map((e) => (
            <li key={e.id} className="w-[80%] shrink-0 snap-start sm:w-auto">
              <Link href={`/events/${e.id}`} className="flex h-full flex-col gap-2 rounded-2xl border border-cs-grid bg-cs-sheet p-5 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-cs-accent/50 motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-cs-ink-soft">
                  {e.featured && <span className="inline-flex items-center gap-1 font-semibold text-cs-accent-text"><Sparkles className="h-3 w-3" aria-hidden /> {t('public.featured')} ·</span>}
                  {td(`public.kind:${e.kind}`, KIND_LABELS[e.kind])} · {e.mode === 'online' ? td('public.mode:online', MODE_LABELS.online) : e.city || td(`public.mode:${e.mode}`, MODE_LABELS[e.mode])}
                </span>
                <span className="line-clamp-2 font-semibold text-cs-ink">{e.title}</span>
                <span className="mt-auto text-sm tabular-nums text-cs-ink-soft">{formatRange(e.starts_at, e.ends_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
