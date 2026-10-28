import type { Metadata } from 'next'
import { EventView, eventMetadata } from './event-view'

// Rendered per request (never at build: no DB there). Found items come from
// the data cache (15 min, purged on publish); unknown slugs are not cached
// (hit-only loaders), so random URLs can't fill the cache. DB errors throw
// to the error boundary instead of caching a 404.
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return eventMetadata((await params).id, 'en')
}

export default async function EventDetailPage({ params }: Props) {
  return <EventView id={(await params).id} locale="en" />
}
