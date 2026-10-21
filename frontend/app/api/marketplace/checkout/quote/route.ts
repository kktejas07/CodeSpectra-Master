/**
 * POST /api/marketplace/checkout/quote { coupon? } — signed-in buyer's server-side totals
 * (subtotal, discount, shipping, tax, grand total) for the checkout page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { priceCart } from '@/lib/marketplace/checkout'
import { cartView } from '@/lib/marketplace/cart'
import { errorResponse, resolveCartRef, applyAnonCookie } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: 'Sign in to check out.', code: 'mkt_signin_checkout' }, { status: gate.status })
  const limited = await limitRequest(req, 'mkt-quote', gate.user.id, 30, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { coupon?: unknown }
  const coupon = typeof body.coupon === 'string' && /^[A-Za-z0-9_-]{2,40}$/.test(body.coupon.trim()) ? body.coupon.trim().toUpperCase() : null
  try {
    const r = await resolveCartRef() // merges a guest cart picked up before sign-in
    const cart = await cartView(r.ref)
    if (!cart.lines.length) return applyAnonCookie(NextResponse.json({ cart, quote: null }), r)
    if (!cart.ok) return applyAnonCookie(NextResponse.json({ cart, quote: null, error: 'Some items in your cart changed. Review your cart before paying.', code: 'cart_changed' }, { status: 409 }), r)
    const p = await priceCart(gate.user.id, coupon)
    return applyAnonCookie(NextResponse.json({ cart, quote: p.quote, coupon: p.coupon?.code ?? null, coupon_error: p.couponError }), r)
  } catch (e) {
    return errorResponse(e, 'quote')
  }
}
