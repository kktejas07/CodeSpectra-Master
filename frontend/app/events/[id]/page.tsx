import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarPlus, Clock, ExternalLink, Globe, MapPin, Sparkles, Trophy } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { getFeedEvent, listPublishedFeed } from '@/lib/events-feed/query'
import { countryName, formatRange, KIND_LABELS, MODE_LABELS, toPublic, withUtm } from '@/lib/events-feed/public'
import type { PublicFeedEvent } from '@/lib/events-feed/types'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

async function load(id: string): Promise<PublicFeedEvent | null> {
  const doc = await getFeedEvent(id).catch(() => null)
  if (doc) return doc.status === 'hidden' ? null : toPublic(doc)
  return (await listPublishedFeed().catch(() => [])).find((e) => e.id === id) || null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const ev = await load(id)
  if (!ev) return { title: 'Event not found — CodeSpectra' }
  return { title: `${ev.title} — Events | CodeSpectra`, description: ev.summary.slice(0, 160), alternates: { canonical: `/events/${ev.id}` } }
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params
  const ev = await load(id)
  if (!ev) notFound()
  const where = ev.mode === 'online' ? 'Online' : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ') || MODE_LABELS[ev.mode]
  const ended = ev.ends_at ? Date.parse(ev.ends_at) < Date.now() : false
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Event', name: ev.title, startDate: ev.starts_at || undefined, endDate: ev.ends_at || undefined,
    eventAttendanceMode: ev.mode === 'online' ? 'https://schema.org/OnlineEventAttendanceMode' : ev.mode === 'hybrid' ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    location: ev.mode === 'online' ? { '@type': 'VirtualLocation', url: ev.url } : { '@type': 'Place', name: where, address: where },
    organizer: ev.organiser ? { '@type': 'Organization', name: ev.organiser } : undefined, url: ev.url, description: ev.summary,
  }
  return (
    <PublicPageWrapper>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <article className="min-w-0 space-y-6">
          <Link href="/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All events</Link>
          <div className="flex flex-wrap gap-1.5">
            {ev.featured && <Badge className="gap-1 bg-primary text-primary-foreground"><Sparkles className="h-3 w-3" /> Featured</Badge>}
            <Badge variant="secondary">{KIND_LABELS[ev.kind]}</Badge>
            <Badge variant="outline" className="gap-1">{ev.mode === 'online' ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{MODE_LABELS[ev.mode]}</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">{ev.title}</h1>
            {ev.organiser && <p className="mt-2 text-muted-foreground">Organised by {ev.organiser}</p>}
          </div>
          {ev.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.image} alt="" referrerPolicy="no-referrer" className="max-h-72 w-full rounded-3xl border border-border/70 object-cover" />
          )}
          <p className="max-w-[65ch] text-lg leading-relaxed text-foreground">{ev.summary}</p>
          <dl className="grid gap-4 rounded-3xl border border-border/70 bg-card p-6 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">When</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{formatRange(ev.starts_at, ev.ends_at, 'UTC')} <span className="text-muted-foreground">(UTC)</span></dd></div>
            <div><dt className="text-sm text-muted-foreground">Where</dt><dd className="mt-1 font-medium text-foreground">{where}</dd></div>
            {ev.registration_deadline && <div><dt className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Registration closes</dt><dd className="mt-1 font-medium text-foreground">{new Date(ev.registration_deadline).toUTCString().replace(':00 GMT', ' UTC')}</dd></div>}
            {ev.prize_text && <div><dt className="flex items-center gap-1 text-sm text-muted-foreground"><Trophy className="h-3.5 w-3.5" /> Prizes</dt><dd className="mt-1 font-medium text-foreground">{ev.prize_text}</dd></div>}
          </dl>
          {ev.themes.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Themes">{ev.themes.map((t) => <li key={t} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{t.replace(/-/g, ' ')}</li>)}</ul>
          )}
          <div className="flex flex-wrap gap-3">
            {!ended && (
              <Button asChild className="h-11 rounded-xl px-6">
                <a href={withUtm(ev.url, ev.internal)} target={ev.internal ? undefined : '_blank'} rel={ev.internal ? undefined : 'noopener nofollow'}>
                  {ev.internal ? 'Open event' : 'Register on the organiser’s site'} {!ev.internal && <ExternalLink className="h-4 w-4" />}
                </a>
              </Button>
            )}
            {ev.starts_at && (
              <Button asChild variant="outline" className="h-11 rounded-xl"><a href={`/api/events-feed/${ev.id}/ics`} download><CalendarPlus className="h-4 w-4" /> Add to calendar</a></Button>
            )}
          </div>
          {!ev.internal && <p className="text-xs text-muted-foreground">This summary is written by CodeSpectra from the organiser’s public listing. Check the organiser’s page for rules and eligibility.</p>}
        </article>
        <aside className="lg:pt-10"><NotifyBox compact /></aside>
      </div>
    </PublicPageWrapper>
  )
}
