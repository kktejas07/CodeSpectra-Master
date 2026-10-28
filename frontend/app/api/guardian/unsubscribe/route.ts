/**
 * One-click unsubscribe from guardian reports (HMAC token per link, no session).
 * POST ?l=&t= (RFC 8058 List-Unsubscribe-Post) or JSON { l, t }. CSRF-exempt (lib/csrf-exempt.ts).
 */
import type { NextRequest } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody } from '@/lib/api-errors'
import { guardianFail, json } from '@/lib/guardian/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limited = await limitRequest(req, 'guardian-unsub', null, 20, 10 * 60_000)
  if (limited) return limited
  const q = new URL(req.url).searchParams
  let l = q.get('l') || ''
  let t = q.get('t') || ''
  if (!l || !t) {
    const b = (await req.json().catch(() => null)) as { l?: unknown; t?: unknown } | null
    l = typeof b?.l === 'string' ? b.l : ''
    t = typeof b?.t === 'string' ? b.t : ''
  }
  try {
    const { unsubscribeGuardian } = await import('@/lib/guardian/service')
    if (!(await unsubscribeGuardian(l, t))) return json(apiErrorBody('This unsubscribe link is not valid.', 'guardian_unsubscribe_invalid'), 400)
    return json({ ok: true })
  } catch (e) {
    return guardianFail(e, 'unsubscribe')
  }
}
