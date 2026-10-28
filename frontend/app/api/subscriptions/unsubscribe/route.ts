/**
 * POST /api/subscriptions/unsubscribe — public. Body: { s, t, scope? }
 * scope: 'all' (default) | 'email' | 'whatsapp' | 'topic:<name>'. Needs the
 * manage token from the email footer; WhatsApp users reply STOP instead.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { isLinkScope, unsubscribe } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const l = await rateLimitRedis(`subs:unsub-ip:${clientLimiterKeyFromRequest(req, null)}`, 30, 10 * 60_000)
  if (!l.ok) return NextResponse.json({ error: `Too many requests. Try again in ${l.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: l.retryAfterSec } }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as { s?: unknown; t?: unknown; scope?: unknown }
  const scope = isLinkScope(b.scope) && b.scope !== 'manage' ? b.scope : 'all'
  const r = await unsubscribe(b.s, b.t, scope)
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
}
