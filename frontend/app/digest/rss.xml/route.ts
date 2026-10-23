/** GET /digest/rss.xml — RSS 2.0: one entry per published daily digest (newest 30). */
import { escapeHtml } from '@/lib/safe-html'
import { getSiteOrigin } from '@/lib/seo/settings'
import { listDigests, type DigestListRow } from '@/lib/digest/store'
import { fmtDay } from '@/lib/digest/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const origin = await getSiteOrigin()
  let rows: DigestListRow[] = []
  try {
    rows = (await listDigests({ publishedOnly: true, limit: 30 })).rows
  } catch (e) {
    console.error('[digest] rss:', (e as Error)?.message)
  }
  const items = rows.map((d) => {
    const link = `${origin}/digest/${d.date}`
    const desc = `${d.count} picks: ${d.top.map((x) => x.title).join(' · ')}`
    return `    <item>
      <title>${escapeHtml(`Daily digest: ${fmtDay(d.date, 'en')}`)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <description>${escapeHtml(desc)}</description>
      ${d.published_at ? `<pubDate>${new Date(d.published_at).toUTCString()}</pubDate>` : ''}
    </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CodeSpectra daily digest</title>
    <link>${escapeHtml(`${origin}/digest`)}</link>
    <atom:link href="${escapeHtml(`${origin}/digest/rss.xml`)}" rel="self" type="application/rss+xml" />
    <description>The best open hackathons, contests, tech news and Learn posts for builders, every day.</description>
    <language>en</language>
${items}
  </channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
