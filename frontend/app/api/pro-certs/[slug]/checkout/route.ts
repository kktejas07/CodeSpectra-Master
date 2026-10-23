/**
 * POST /api/pro-certs/[slug]/checkout { currency: 'INR' | 'USD' } — buy one
 * proctored attempt. Server checks eligibility (open attempt, cooldown,
 * attempts per year, renewal window) and the price; payment goes through the
 * existing PhonePe / Stripe flows. 200 { redirect_url, order_id }.
 */
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { errorJson, json } from '@/lib/pro-certs/http'
import { nativeCheckoutBlock } from '@/lib/billing/native-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ currency: z.enum(['INR', 'USD']) }).strict()

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const blocked = nativeCheckoutBlock(req) // CORE-038
  if (blocked) return blocked
  const g = await requireAuth()
  if ('error' in g) return json({ error: g.error, code: 'unauthorized' }, g.status)
  const rl = await rateLimitRedis(`pro-cert-checkout:${g.user.id}`, 10, 10 * 60_000)
  if (!rl.ok) return json({ error: 'Too many requests. Please try again shortly.', code: 'rate_limited_shortly' }, 429)
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: 'Choose a currency.', code: 'pro_cert_currency_required' }, 400)
  const { slug } = await ctx.params
  try {
    const { checkout } = await import('@/lib/pro-certs/service')
    return json(await checkout({ id: g.user.id, email: g.user.email }, slug, b.data.currency))
  } catch (e) {
    return errorJson(e, 'checkout')
  }
}
