/**
 * One-click unsubscribe from the weekly hiring digest (link + List-Unsubscribe-Post).
 * ?t=<tenant>&u=<user>&k=<HMAC token>. No sign-in needed; the token only opts
 * that one person out of that one organisation's digest.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAppOrigin } from '@/lib/app-origin'
import { digestUnsubTokenOk } from '@/lib/ats/hiring-insights'

export const dynamic = 'force-dynamic'

const ID = /^[A-Za-z0-9_-]{1,128}$/

async function unsubscribe(req: NextRequest): Promise<boolean> {
  const sp = req.nextUrl.searchParams
  const t = sp.get('t') || '', u = sp.get('u') || '', k = sp.get('k') || ''
  if (!ID.test(t) || !ID.test(u)) return false
  const { deriveServerKey } = await import('@/lib/session')
  if (!digestUnsubTokenOk(await deriveServerKey('hiring-digest-unsub'), t, u, k)) return false
  const { setDigestOptOut } = await import('@/lib/ats/hiring-insights-server')
  await setDigestOptOut(t, u, true)
  return true
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req).catch(() => false)
  return NextResponse.redirect(`${getAppOrigin()}/dashboard/hiring/analytics?digest=${ok ? 'unsubscribed' : 'invalid'}`, 303)
}

export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req).catch(() => false)
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
}
