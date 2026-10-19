/**
 * GET /api/public/facts — machine-readable product facts for AI agents and
 * answer engines (also linked from llms.txt and allowed in robots.txt).
 * Public, read-only, rate-limited, cached.
 */
import { NextRequest, NextResponse } from 'next/server'
import { buildFacts } from '@/lib/seo/llms'
import { getSeoSettings } from '@/lib/seo/settings'
import { resolveSiteUrl } from '@/lib/seo/site'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'public-facts', null, 60, 60_000)
  if (limited) return limited
  const seo = await getSeoSettings()
  const site = resolveSiteUrl(seo.site_url)
  let plans: { name: string; price: number; yearly_price?: number; currency: string | null }[] = []
  try {
    const { getClientPlans } = await import('@/lib/pricing-catalog-server')
    plans = (await getClientPlans()).filter((p) => p.checkout_mode !== 'contact_sales').map((p) => ({ name: String(p.name), price: Number(p.price), yearly_price: Number(p.yearlyPrice), currency: p.currency ?? null }))
  } catch { /* facts still serve without live prices */ }
  const body = buildFacts({ site, sameAs: seo.social_profiles, locations: seo.organization.locations, email: seo.organization.email, plans })
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', 'Access-Control-Allow-Origin': '*' } })
}
