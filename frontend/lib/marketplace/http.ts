/** Route helpers for the buyer API: error mapping and the guest-cart cookie. */
import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAPIUser, type APIUser } from '@/lib/route-auth'
import { ANON_CART_COOKIE, CartError, mergeAnonCart, type CartRef } from './cart'
import { MktError } from './settings'
import { apiErrorBody } from '@/lib/api-errors'

export function errorResponse(e: unknown, where: string): NextResponse {
  if (e instanceof CartError || e instanceof MktError) {
    // CartError codes the cart UI branches on ('address', 'coupon', …) win; otherwise a catalog code (lib/api-errors).
    return NextResponse.json(apiErrorBody(e.message, e.code, e.params), { status: e.status })
  }
  console.error(`[marketplace] ${where} failed:`, (e as Error)?.message)
  return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
}

const ANON_RE = /^[a-f0-9-]{36}$/

/**
 * Resolve the cart owner. Signed in + a guest cookie → merge the guest cart into the user's
 * cart once and drop the cookie. `create` mints a guest id for a first add-to-cart.
 */
export async function resolveCartRef(opts: { create?: boolean } = {}): Promise<{ ref: CartRef; user: APIUser | null; setAnon: string | null; clearAnon: boolean }> {
  const user = await getAPIUser()
  const jar = await cookies()
  const raw = jar.get(ANON_CART_COOKIE)?.value || ''
  const anon = ANON_RE.test(raw) ? raw : null
  if (user) {
    if (anon) await mergeAnonCart(user.id, anon)
    return { ref: { userId: user.id, anonId: null }, user, setAnon: null, clearAnon: !!anon }
  }
  if (anon) return { ref: { userId: null, anonId: anon }, user: null, setAnon: null, clearAnon: false }
  const fresh = opts.create ? randomUUID() : null
  return { ref: { userId: null, anonId: fresh }, user: null, setAnon: fresh, clearAnon: false }
}

export function applyAnonCookie(res: NextResponse, r: { setAnon: string | null; clearAnon: boolean }): NextResponse {
  if (r.setAnon) {
    res.cookies.set(ANON_CART_COOKIE, r.setAnon, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86_400 })
  } else if (r.clearAnon) {
    res.cookies.set(ANON_CART_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  }
  return res
}
