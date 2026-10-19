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
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, eventJsonLd, type QA } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqList } from '@/components/seo/faq-list'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

async function load(id: string): Promise<PublicFeedEvent | null> {
  const doc = await getFeedEvent(id).catch(() => null)
  if (doc) return doc.status === 'hidden' ? null : toPublic(doc)
  return (await listPublishedFeed().catch(() => [])).find((e) => e.id === id) || null
}

/** Internal hackathons have their real page under /hackathons — canonicalise there (SEO-018). */
function canonicalFor(ev: PublicFeedEvent): string {
  return ev.internal && ev.url.startsWith('/') && !ev.url.startsWith('//') ? ev.url.split('?')[0] : `/events/${ev.id}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const ev = await load(id)
  if (!ev) return { title: 'Event not found', robots: { index: false, follow: true } }
  const when = ev.starts_at ? formatRange(ev.starts_at, ev.ends_at, 'UTC') : ''
  return buildMetadata({
    title: `${ev.title}: ${KIND_LABELS[ev.kind]}`,
    description: ev.summary,
    path: `/events/${ev.id}`,
    canonical: canonicalFor(ev),
    kind: 'event',
    image: ev.image || undefined,
    ogSubtitle: [when, ev.mode === 'online' ? 'Online' : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
  })
}

function eventFaqs(ev: PublicFeedEvent, where: string): QA[] {
  const out: QA[] = []
  if (ev.starts_at) out.push({ q: `When is ${ev.title}?`, a: `${formatRange(ev.starts_at, ev.ends_at, 'UTC')} (UTC).` })
  out.push({ q: `Where does ${ev.title} take place?`, a: ev.mode === 'online' ? 'It runs online.' : ev.mode === 'hybrid' ? `It is hybrid: online and in person at ${where}.` : `In person at ${where}.` })
  if (ev.registration_deadline) out.push({ q: 'When does registration close?', a: `${new Date(ev.registration_deadline).toUTCString().replace(':00 GMT', ' UTC')}.` })
  out.push({ q: 'How do I register?', a: ev.internal ? 'Open the event page on CodeSpectra and sign in to register your team.' : `Register on the organiser’s site${ev.organiser ? ` (${ev.organiser})` : ''}; CodeSpectra lists the event and links to it.` })
  if (ev.prize_text) out.push({ q: 'Are there prizes?', a: `Yes: ${ev.prize_text}.` })
  return out
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params
  const ev = await load(id)
  if (!ev) notFound()
  const where = ev.mode === 'online' ? 'Online' : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ') || MODE_LABELS[ev.mode]
  const ended = ev.ends_at ? Date.parse(ev.ends_at) < Date.now() : false
  const site = await getSiteOrigin()
  const faqs = eventFaqs(ev, where)
  const jsonLd = [
    eventJsonLd({
      name: ev.title,
      description: ev.summary,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
      mode: ev.mode,
      url: ev.internal ? `${site}${canonicalFor(ev)}` : ev.url,
      pageUrl: canonicalFor(ev),
      city: ev.city,
      country: ev.country,
      organiser: ev.organiser,
      image: ev.image,
      free: ev.internal,
      registrationDeadline: ev.registration_deadline,
    }, site),
    breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Events', path: '/events' }, { name: ev.title, path: `/events/${ev.id}` }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
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
            <img src={ev.image} alt={`${ev.title} banner`} width={1200} height={480} fetchPriority="high" decoding="async" referrerPolicy="no-referrer" className="aspect-[5/2] max-h-72 w-full rounded-3xl border border-border/70 object-cover" />
          )}
          <p className="speakable-summary max-w-[65ch] text-lg leading-relaxed text-foreground">{ev.summary}</p>
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
          <section aria-labelledby="event-faq" className="pt-4">
            <h2 id="event-faq" className="mb-4 text-xl font-semibold text-foreground">Event FAQ</h2>
            <FaqList items={faqs} idPrefix="event-faq" schema={false} />
          </section>
        </article>
        <aside className="lg:pt-10"><NotifyBox compact /></aside>
      </div>
    </PublicPageWrapper>
  )
}
