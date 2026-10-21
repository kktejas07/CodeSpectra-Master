/**
 * GET  /api/marketplace/cart — the caller's cart (guest cookie or signed-in), re-validated
 *      against the live catalog (price, stock, slots, currency) with a server-side quote.
 * POST /api/marketplace/cart {action, …} — add / update / remove / save_for_later /
 *      move_to_cart / remove_saved / clear. Adding an item in another currency answers 409
 *      code=currency_switch_required unless `switch_currency: true` is sent.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { applyCartAction, cartView, parseCartAction } from '@/lib/marketplace/cart'
import { applyAnonCookie, errorResponse, resolveCartRef } from '@/lib/marketplace/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'mkt-cart-read', null, 120, 60_000)
  if (limited) return limited
  try {
    const r = await resolveCartRef()
    return applyAnonCookie(NextResponse.json({ cart: await cartView(r.ref), signed_in: !!r.user }), r)
  } catch (e) {
    return errorResponse(e, 'cart read')
  }
}

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'mkt-cart-write', null, 60, 60_000)
  if (limited) return limited
  const action = parseCartAction(await req.json().catch(() => null))
  if (!action) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  try {
    const r = await resolveCartRef({ create: action.action === 'add' })
    await applyCartAction(r.ref, action)
    return applyAnonCookie(NextResponse.json({ cart: await cartView(r.ref), signed_in: !!r.user }), r)
  } catch (e) {
    return errorResponse(e, 'cart write')
  }
}
