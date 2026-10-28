import { Metadata } from 'next'
import { EventsView, eventsMetadata } from './events-view'

export const metadata: Metadata = eventsMetadata('en')

// Rendered per request, never at build (the build has no DB). Data comes from
// the tag-purged data cache (lib/cache/public-data.ts), so the first request
// after a deploy fills it and later ones don't hit Mongo.
export const dynamic = 'force-dynamic'

export default function PublicEventsPage() {
  return <EventsView locale="en" />
}
