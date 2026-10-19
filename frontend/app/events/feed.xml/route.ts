/** GET /events/feed.xml — RSS 2.0 feed of upcoming published events (lib/events-feed). */
import { listPublishedFeed } from '@/lib/events-feed/query'
import { formatRange, KIND_LABELS } from '@/lib/events-feed/public'
import { escapeHtml } from '@/lib/safe-html'
import { getSiteOrigin } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const site = await getSiteOrigin()
  let events: Awaited<ReturnType<typeof listPublishedFeed>> = []
  try {
    events = (await listPublishedFeed()).slice(0, 100)
  } catch (e) {
    console.error('[events] rss:', (e as Error)?.message)
  }
  const items = events.map((ev) => {
    const link = ev.internal && ev.url.startsWith('/') ? `${site}${ev.url}` : `${site}/events/${encodeURIComponent(ev.id)}`
    const when = ev.starts_at ? formatRange(ev.starts_at, ev.ends_at, 'UTC') + ' (UTC)' : 'Dates to be announced'
    return `    <item>
      <title>${escapeHtml(ev.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="false">codespectra-event-${escapeHtml(ev.id)}</guid>
      <description>${escapeHtml(`${KIND_LABELS[ev.kind]} · ${when}. ${ev.summary}`)}</description>
      <category>${escapeHtml(KIND_LABELS[ev.kind])}</category>
    </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CodeSpectra Events</title>
    <link>${escapeHtml(`${site}/events`)}</link>
    <atom:link href="${escapeHtml(`${site}/events/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Upcoming hackathons, codeathons, buildathons, CTFs and coding contests, including CodeSpectra's own events.</description>
    <language>en</language>
${items}
  </channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
