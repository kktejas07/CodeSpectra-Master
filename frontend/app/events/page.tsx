import { Metadata } from 'next'
import { PublicPageWrapper } from '@/app/public-layout'
import { PageHero } from '@/components/landing/page-hero'
import { DeviceShowcase } from '@/components/visuals'
import { EventsExplorer } from '@/components/events-feed/events-explorer'
import { listPublishedFeed } from '@/lib/events-feed/query'
import { getAppOrigin } from '@/lib/app-origin'

export const metadata: Metadata = {
  title: 'Events — hackathons, codeathons and buildathons worldwide | CodeSpectra',
  description: 'Upcoming hackathons, codeathons, buildathons, CTFs and coding contests from around the world, plus CodeSpectra’s own events. Filter by format, country, theme and deadline, and get notified by email or WhatsApp.',
  alternates: { canonical: '/events' },
}

// Rendered per request so the build never needs a DB connection.
export const dynamic = 'force-dynamic'

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
