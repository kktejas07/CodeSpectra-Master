import { Metadata } from 'next'
import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock, ExternalLink, Globe, MapPin, Sparkles, Trophy } from 'lucide-react'
import { PublicPageWrapper } from '@/app/public-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NotifyBox } from '@/components/events-feed/notify-box'
import { AddToCalendar } from '@/components/events-feed/event-card'
import { feedEventCached } from '@/lib/cache/public-data'
import { countryName, formatRange, KIND_LABELS, MODE_LABELS, toPublic, withUtm } from '@/lib/events-feed/public'
import type { PublicFeedEvent } from '@/lib/events-feed/types'
import { buildMetadata } from '@/lib/seo/metadata'
import { breadcrumbJsonLd, eventJsonLd, type QA } from '@/lib/seo/jsonld'
import { getSiteOrigin } from '@/lib/seo/settings'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqList } from '@/components/seo/faq-list'
import type { Locale } from '@/lib/i18n/config'
import { localizedPath } from '@/lib/i18n/public-paths'
import { publicT, type PublicTranslator } from '@/lib/i18n/public-server'

// One event for every language (English: ./page.tsx, hi / te: app/[lang]/events/[id]).
// SEO-047: the chrome and FAQ follow the page language; the organiser's
// summary stays as listed, so /hi and /te canonicalise to the English URL.

const load = cache((id: string): Promise<PublicFeedEvent | null> => feedEventCached(id))

/** Internal hackathons have their real page under /hackathons — canonicalise there (SEO-018). */
function canonicalFor(ev: PublicFeedEvent): string {
  return ev.internal && ev.url.startsWith('/') && !ev.url.startsWith('//') ? ev.url.split('?')[0] : `/events/${ev.id}`
}

export async function eventMetadata(id: string, locale: Locale): Promise<Metadata> {
  const t = publicT(locale)
  const ev = await load(id)
  if (!ev) return { title: t('hubs.dtEventNotFound'), robots: { index: false, follow: true } }
  const when = ev.starts_at ? formatRange(ev.starts_at, ev.ends_at, 'UTC') : ''
  return buildMetadata({
    title: `${ev.title}: ${t.dyn(`public.kind:${ev.kind}`, KIND_LABELS[ev.kind])}`,
    description: ev.summary,
    path: `/events/${ev.id}`,
    locale,
    canonical: canonicalFor(ev),
    kind: 'event',
    image: ev.image || undefined,
    ogSubtitle: [when, ev.mode === 'online' ? t.dyn('public.mode:online', 'Online') : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
  })
}

const utc = (iso: string) => new Date(iso).toUTCString().replace(':00 GMT', ' UTC')

function eventFaqs(ev: PublicFeedEvent, where: string, t: PublicTranslator): QA[] {
  const out: QA[] = []
  if (ev.starts_at) out.push({ q: t('hubs.dtFaqWhenQ', { title: ev.title }), a: t('hubs.dtFaqWhenA', { range: formatRange(ev.starts_at, ev.ends_at, 'UTC') }) })
  out.push({ q: t('hubs.dtFaqWhereQ', { title: ev.title }), a: ev.mode === 'online' ? t('hubs.dtFaqWhereOnline') : ev.mode === 'hybrid' ? t('hubs.dtFaqWhereHybrid', { where }) : t('hubs.dtFaqWhereInPerson', { where }) })
  if (ev.registration_deadline) out.push({ q: t('hubs.dtFaqRegQ'), a: t('hubs.dtFaqRegA', { date: utc(ev.registration_deadline) }) })
  out.push({ q: t('hubs.dtFaqHowQ'), a: ev.internal ? t('hubs.dtFaqHowInternal') : ev.organiser ? t('hubs.dtFaqHowExternalOrg', { organiser: ev.organiser }) : t('hubs.dtFaqHowExternal') })
  if (ev.prize_text) out.push({ q: t('hubs.dtFaqPrizeQ'), a: t('hubs.dtFaqPrizeA', { prizes: ev.prize_text }) })
  return out
}

export async function EventView({ id, locale }: { id: string; locale: Locale }) {
  const t = publicT(locale)
  const lp = (p: string) => localizedPath(p, locale)
  const ev = await load(id)
  if (!ev) notFound()
  const modeLabel = t.dyn(`public.mode:${ev.mode}`, MODE_LABELS[ev.mode])
  const where = ev.mode === 'online' ? modeLabel : [ev.city, ev.country && countryName(ev.country)].filter(Boolean).join(', ') || modeLabel
  const ended = ev.ends_at ? Date.parse(ev.ends_at) < Date.now() : false
  const site = await getSiteOrigin()
  const faqs = eventFaqs(ev, where, t)
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
    breadcrumbJsonLd([{ name: t('marketing.crumbHome'), path: lp('/') }, { name: t('hubs.dtEventsCrumb'), path: lp('/events') }, { name: ev.title, path: lp(`/events/${ev.id}`) }], site),
  ]
  return (
    <PublicPageWrapper>
      <JsonLd data={jsonLd} />
      <div className="mx-auto grid max-w-[1100px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <article className="min-w-0 space-y-6">
          <Link href={lp('/events')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> {t('hubs.dtAllEvents')}</Link>
          <div className="flex flex-wrap gap-1.5">
            {ev.featured && <Badge className="gap-1 bg-primary text-primary-foreground"><Sparkles className="h-3 w-3" aria-hidden /> {t('hubs.dtFeatured')}</Badge>}
            <Badge variant="secondary">{t.dyn(`public.kind:${ev.kind}`, KIND_LABELS[ev.kind])}</Badge>
            <Badge variant="outline" className="gap-1">{ev.mode === 'online' ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{modeLabel}</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl">{ev.title}</h1>
            {ev.organiser && <p className="mt-2 text-muted-foreground">{t('hubs.dtOrganisedBy', { name: ev.organiser })}</p>}
          </div>
          {ev.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.image} alt={t('hubs.dtBanner', { title: ev.title })} width={1200} height={480} fetchPriority="high" decoding="async" referrerPolicy="no-referrer" className="aspect-[5/2] max-h-72 w-full rounded-3xl border border-border/70 object-cover" />
          )}
          <p className="speakable-summary max-w-[65ch] text-lg leading-relaxed text-foreground">{ev.summary}</p>
          <dl className="grid gap-4 rounded-3xl border border-border/70 bg-card p-6 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">{t('hubs.dtWhen')}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{formatRange(ev.starts_at, ev.ends_at, 'UTC')} <span className="text-muted-foreground">(UTC)</span></dd></div>
            <div><dt className="text-sm text-muted-foreground">{t('hubs.dtWhere')}</dt><dd className="mt-1 font-medium text-foreground">{where}</dd></div>
            {ev.registration_deadline && <div><dt className="flex items-center gap-1 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden /> {t('hubs.dtRegCloses')}</dt><dd className="mt-1 font-medium text-foreground">{utc(ev.registration_deadline)}</dd></div>}
            {ev.prize_text && <div><dt className="flex items-center gap-1 text-sm text-muted-foreground"><Trophy className="h-3.5 w-3.5" aria-hidden /> {t('hubs.dtPrizes')}</dt><dd className="mt-1 font-medium text-foreground">{ev.prize_text}</dd></div>}
          </dl>
          {ev.themes.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('hubs.dtThemes')}>{ev.themes.map((t) => <li key={t} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{t.replace(/-/g, ' ')}</li>)}</ul>
          )}
          <div className="flex flex-wrap gap-3">
            {!ended && (
              <Button asChild className="h-11 rounded-xl px-6">
                <a href={withUtm(ev.url, ev.internal)} target={ev.internal ? undefined : '_blank'} rel={ev.internal ? undefined : 'noopener nofollow'}>
                  {ev.internal ? t('hubs.dtOpenEvent') : t('hubs.dtRegisterOrganiser')} {!ev.internal && <ExternalLink className="h-4 w-4" />}
                </a>
              </Button>
            )}
            {ev.starts_at && <AddToCalendar ev={ev} pageUrl={`${site}/events/${ev.id}`} label={t('hubs.dtAddToCalendar')} />}
          </div>
          {!ev.internal && <p className="text-xs text-muted-foreground">{t('hubs.dtEventDisclaimer')}</p>}
          <section aria-labelledby="event-faq" className="pt-4">
            <h2 id="event-faq" className="mb-4 text-xl font-semibold text-foreground">{t('hubs.dtEventFaq')}</h2>
            <FaqList items={faqs} idPrefix="event-faq" schema={false} />
          </section>
        </article>
        <aside className="lg:pt-10"><NotifyBox compact /></aside>
      </div>
    </PublicPageWrapper>
  )
}
