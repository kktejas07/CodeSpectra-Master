/** GET /llms-full.txt — the long-form product reference + FAQ + Learn index for AI assistants. */
import { buildLlmsFullTxt } from '@/lib/seo/llms'
import { ALL_SITE_FAQS } from '@/lib/seo/faq-content'
import { docLinks, learnLinks } from '@/lib/seo/llms-data'
import { getSiteOrigin } from '@/lib/seo/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const [site, learn, docs] = await Promise.all([getSiteOrigin(), learnLinks(200), docLinks()])
  return new Response(buildLlmsFullTxt({ site, faqs: ALL_SITE_FAQS, learn, docs }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
