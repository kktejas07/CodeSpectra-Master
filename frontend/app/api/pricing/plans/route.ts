import { NextRequest, NextResponse } from 'next/server'
import { getClientPlans } from '@/lib/pricing-catalog-server'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

/**
 * Public catalog for marketing pages (no auth). Prices, currency and
 * checkout_mode come from the checkout resolver, so cards match the charge.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimitRedis(`pricing:${clientLimiterKeyFromRequest(req, null)}`, 60, 60_000).catch(() => ({ ok: true as const }))
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  try {
    return NextResponse.json(await getClientPlans())
  } catch (e) {
    console.error('[CodeSpectra] Public pricing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
