/** GET /llms.txt — llmstxt.org summary of CodeSpectra for AI assistants (lib/seo/llms). */
import { buildLlmsTxt } from '@/lib/seo/llms'
import { docLinks, learnCategoryLinks, learnLinks } from '@/lib/seo/llms-data'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  const [learn, docs] = await Promise.all([learnLinks(30), docLinks()])
  const body = buildLlmsTxt({
    site,
    learn: learn.map((l) => ({ title: l.title, path: l.path, note: l.summary })),
    learnCategories: learnCategoryLinks(),
    docs: docs.slice(0, 30),
    comparisons: seo.comparisons.filter((c) => c.published).map((c) => ({ title: `CodeSpectra vs ${c.competitor}`, path: `/compare/${c.slug}`, note: c.summary })),
  })
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
