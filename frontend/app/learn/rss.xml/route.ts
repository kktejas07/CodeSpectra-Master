/** GET /learn/rss.xml — RSS 2.0 feed of the latest published Learn posts. */
import { latestPublished } from '@/lib/learn/queries'
import { escapeHtml } from '@/lib/safe-html'
import { getAppOrigin } from '@/lib/app-origin'
import { postUrl } from '@/lib/learn/share'
import { categoryLabel } from '@/lib/learn/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const origin = getAppOrigin()
  let posts: Awaited<ReturnType<typeof latestPublished>> = []
  try {
    posts = await latestPublished(50)
  } catch (e) {
    console.error('[learn] rss:', (e as Error)?.message)
  }
  const items = posts.map((p) => {
    const link = postUrl(origin, p.slug)
    return `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <description>${escapeHtml(p.summary)}</description>
      <category>${escapeHtml(categoryLabel(p.category))}</category>
      ${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ''}
    </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CodeSpectra Learn</title>
    <link>${escapeHtml(`${origin}/learn`)}</link>
    <atom:link href="${escapeHtml(`${origin}/learn/rss.xml`)}" rel="self" type="application/rss+xml" />
    <description>Original explainers on algorithms, system design and engineering practices.</description>
    <language>en</language>
${items}
  </channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
