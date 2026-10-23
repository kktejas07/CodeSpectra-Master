/**
 * POST /api/marketplace/checkout — signed-in buyers only.
 * Body: { contact_phone, address? (physical items), coupon?, buyer_timezone? }
 * Prices, tax, shipping, discount and commission are computed on the server from the cart;
 * nothing amount-like is read from the body. Returns { order_id, number, redirect_url }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { createCheckout, parseCheckoutInput } from '@/lib/marketplace/checkout'
import { errorResponse } from '@/lib/marketplace/http'
import { nativeCheckoutBlock } from '@/lib/billing/native-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const blocked = nativeCheckoutBlock(req) // CORE-038
  if (blocked) return blocked
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: 'Sign in to check out.', code: 'mkt_signin_checkout' }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-checkout', gate.user.id, 10, 10 * 60_000)
  if (limited) return limited
  const parsed = parseCheckoutInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!gate.user.email) return NextResponse.json({ error: 'Add an e-mail address to your account first.', code: 'mkt_email_required' }, { status: 400 })
  try {
    return NextResponse.json(await createCheckout({ id: gate.user.id, email: gate.user.email }, parsed.value))
  } catch (e) {
    return errorResponse(e, 'checkout')
  }
}
