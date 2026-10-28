/** /events body for every language (English: app/events/page.tsx, hi / te: app/[lang]/events). */
import type { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { EventsExplorer } from '@/components/events-feed/events-explorer'
import { AskBox } from '@/components/public-ask/ask-box'
import { eventsFeedCached } from '@/lib/cache/public-data'
import { getAppOrigin } from '@/lib/app-origin'
import type { Locale } from '@/lib/i18n/config'
import { publicT } from '@/lib/i18n/public-server'
import { publicPageMetadata } from '@/lib/i18n/public-page'

export function eventsMetadata(locale: Locale): Metadata {
  const m = publicPageMetadata('/events', locale, { kind: 'event' })
  return { ...m, alternates: { ...m.alternates, types: { 'application/rss+xml': '/events/feed.xml' } } }
}

// A DB outage with nothing cached goes to the error boundary (not an empty list).
export async function EventsView({ locale }: { locale: Locale }) {
  const t = publicT(locale)
  const events = await eventsFeedCached()
  return (
    <PublicPageWrapper>
      <PageHero
        title={t('public.navEvents')}
        lead={t('hubs.eventsLead')}
        art={<DeviceShowcase variant="candidate" compact />}
      />
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
        <AskBox className="mb-8" locale={locale === 'hi' || locale === 'te' ? locale : 'en'} />
        <EventsExplorer events={events} origin={getAppOrigin()} />
      </div>
    </PublicPageWrapper>
  )
}
