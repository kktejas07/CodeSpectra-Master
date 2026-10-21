/** GET /news/rss.xml — RSS 2.0 feed of the latest published tech news. */
import { escapeHtml } from '@/lib/safe-html'
import { getSiteOrigin } from '@/lib/seo/settings'
import { newsTopicLabel } from '@/lib/signals/feeds'
import { listNews, type NewsCard } from '@/lib/signals/news'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const origin = await getSiteOrigin()
  let items: NewsCard[] = []
  try {
    items = (await listNews({ limit: 48 })).items
  } catch (e) {
    console.error('[news] rss:', (e as Error)?.message)
  }
  const rows = items.map((n) => {
    const link = `${origin}/news/${encodeURIComponent(n.slug)}`
    return `    <item>
      <title>${escapeHtml(n.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <description>${escapeHtml(n.excerpt)}</description>
      <category>${escapeHtml(newsTopicLabel(n.topic))}</category>
      ${n.published_at ? `<pubDate>${new Date(n.published_at).toUTCString()}</pubDate>` : ''}
    </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CodeSpectra tech news</title>
    <link>${escapeHtml(`${origin}/news`)}</link>
    <atom:link href="${escapeHtml(`${origin}/news/rss.xml`)}" rel="self" type="application/rss+xml" />
    <description>Cloud, security, language releases, AI and India tech careers, summarised for builders.</description>
    <language>en</language>
${rows}
  </channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
