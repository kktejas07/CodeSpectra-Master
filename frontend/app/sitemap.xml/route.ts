/** GET /sitemap.xml — sitemap index pointing at one sitemap per content type (lib/seo/sitemap). */
import { buildSitemapIndexXml, latestLastmod, loadSitemapEntries, SITEMAP_TYPES } from '@/lib/seo/sitemap'
import { getSiteOrigin } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const site = await getSiteOrigin()
  const lists = await Promise.all(SITEMAP_TYPES.map(async (type) => ({ type, entries: await loadSitemapEntries(type) })))
  // Empty types are left out of the index (e.g. no published comparisons yet).
  const items = lists.filter((l) => l.entries.length > 0).map((l) => ({ type: l.type, lastmod: latestLastmod(l.entries) }))
  return new Response(buildSitemapIndexXml(items, site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
