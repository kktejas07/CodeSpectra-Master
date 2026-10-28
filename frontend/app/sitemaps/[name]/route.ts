/** GET /sitemaps/<type>.xml — one <urlset> per content type (lib/seo/sitemap). */
import { buildUrlsetXml, isSitemapType, loadSitemapEntries } from '@/lib/seo/sitemap'
import { getSiteOrigin } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  const type = name.replace(/\.xml$/, '')
  if (!name.endsWith('.xml') || !isSitemapType(type)) return new Response('Not found', { status: 404 })
  const [site, entries] = await Promise.all([getSiteOrigin(), loadSitemapEntries(type)])
  return new Response(buildUrlsetXml(entries, site), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
