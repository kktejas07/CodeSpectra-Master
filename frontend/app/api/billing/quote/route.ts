import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorFor } from '@/lib/api-errors'
import { currencyForBuyer } from '@/lib/billing/plan-prices'
import { parseInterval } from '@/lib/billing-plan-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  plan_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  interval: z.string().max(10).optional(),
  currency: z.enum(['INR', 'USD']).optional(),
  coupon_code: z.string().trim().max(64).optional().nullable(),
}).strict()

/**
 * POST /api/billing/quote — checkout preview (price in the buyer's currency,
 * coupon, account credit, GST split, auto-renew). Server-priced; nothing is reserved.
 */
export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const limited = await limitRequest(req, 'billing-quote', gate.user.id, 60, 60_000)
  if (limited) return limited
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const country = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country')
  try {
    const [{ checkoutQuote }, { hasPaidBefore }] = await Promise.all([import('@/lib/billing/quote'), import('@/lib/payment-service')])
    const r = await checkoutQuote({
      userId: gate.user.id,
      planId: parsed.data.plan_id,
      interval: parseInterval(parsed.data.interval),
      currency: currencyForBuyer({ requested: parsed.data.currency, country }),
      couponCode: parsed.data.coupon_code || null,
      hasPaidBefore: await hasPaidBefore(gate.user.id),
    })
    if (!r.ok) return NextResponse.json({ error: r.code, code: r.code === 'unknown_plan' ? 'not_found' : `billing_${r.code}` }, { status: r.code === 'unknown_plan' ? 404 : 409 })
    return NextResponse.json({ quote: r.quote })
  } catch (e) {
    console.error('[billing/quote]', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
