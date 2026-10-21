import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { EventsExplorer } from '@/components/events-feed/events-explorer'
import { listPublishedFeed } from '@/lib/events-feed/query'
import { getAppOrigin } from '@/lib/app-origin'
import { buildMetadata } from '@/lib/seo/metadata'
import { publicRoute } from '@/lib/seo/public-routes'

const route = publicRoute('/events')!
export const metadata: Metadata = (() => {
  const m = buildMetadata({ title: route.title, description: route.description, path: '/events', kind: 'event' })
  return { ...m, alternates: { ...m.alternates, types: { 'application/rss+xml': '/events/feed.xml' } } }
})()

// ISR, 5 min; the feed pipeline and admin edits purge it on change
// (lib/cache/revalidate.ts). At build (no DB) the list is empty and the root
// layout expires that placeholder on the first request.
export const revalidate = 300

export default async function PublicEventsPage() {
  const events = await listPublishedFeed().catch(() => [])
  return (
    <PublicPageWrapper>
      <PageHero
        title="Events"
        lead="Hackathons, codeathons, buildathons, CTFs and coding contests happening around the world — and our own events, featured first. Register on the organiser’s site, add events to your calendar, or get notified when new ones match what you like."
        art={<DeviceShowcase variant="candidate" compact />}
      />
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
        <EventsExplorer events={events} origin={getAppOrigin()} />
      </div>
    </PublicPageWrapper>
  )
}
