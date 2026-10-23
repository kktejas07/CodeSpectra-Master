import type { Metadata } from 'next'
import { EventView, eventMetadata } from '@/app/events/[id]/event-view'
import { langOf } from '@/lib/i18n/public-page'

// SEO-047: Hindi / Telugu chrome + FAQ around the organiser's listing (canonical: the English URL).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  return eventMetadata(p.id, await langOf(Promise.resolve(p)))
}

export default async function Page({ params }: Props) {
  const p = await params
  return <EventView id={p.id} locale={await langOf(Promise.resolve(p))} />
}
