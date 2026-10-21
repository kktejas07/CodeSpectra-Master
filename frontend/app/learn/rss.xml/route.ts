/** GET /learn/rss.xml — RSS 2.0 feed of the latest published Learn posts and "From the team" posts. */
import { latestPublished } from '@/lib/learn/queries'
import { escapeHtml } from '@/lib/safe-html'
import { getSiteOrigin } from '@/lib/seo/settings'
import { postUrl } from '@/lib/learn/share'
import { categoryLabel } from '@/lib/learn/types'
import { latestTeam } from '@/lib/learn/team-queries'
import { TEAM_LABEL, teamCategoryLabel } from '@/lib/learn/team-posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const origin = await getSiteOrigin()
  type Item = { slug: string; title: string; summary: string; category: string; published_at?: string | null }
  let posts: Item[] = []
  try {
    const [learn, team] = await Promise.all([
      latestPublished(50),
      latestTeam(50).catch(() => []),
    ])
    posts = [
      ...learn.map((p) => ({ ...p, category: categoryLabel(p.category) })),
      ...team.map((p) => ({ ...p, category: `${TEAM_LABEL}: ${teamCategoryLabel(p.category)}` })),
    ].sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || ''))).slice(0, 50)
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
      <category>${escapeHtml(p.category)}</category>
      ${p.published_at ? `<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>` : ''}
    </item>`
  }).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CodeSpectra Learn</title>
    <link>${escapeHtml(`${origin}/learn`)}</link>
    <atom:link href="${escapeHtml(`${origin}/learn/rss.xml`)}" rel="self" type="application/rss+xml" />
    <description>Original explainers on algorithms, system design and engineering practices, plus notes from the CodeSpectra team.</description>
    <language>en</language>
${items}
  </channel>
</rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
