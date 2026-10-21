/**
 * GET  /api/subscriptions/preferences?s=<id>&t=<manage token> — masked view of a subscription.
 * POST /api/subscriptions/preferences  { s, t, topics?, filters?, email?, whatsapp?, whatsapp_consent?, timezone? }
 * The manage token is only ever sent to the subscriber's own inbox / number.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { getByLink, publicView, updatePreferences } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function limited(req: NextRequest) {
  const l = await rateLimitRedis(`subs:prefs-ip:${clientLimiterKeyFromRequest(req, null)}`, 60, 10 * 60_000)
  return l.ok ? null : NextResponse.json({ error: `Too many requests. Try again in ${l.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: l.retryAfterSec } }, { status: 429 })
}

export async function GET(req: NextRequest) {
  const tooMany = await limited(req)
  if (tooMany) return tooMany
  const p = new URL(req.url).searchParams
  const sub = await getByLink(p.get('s'), p.get('t'))
  if (!sub) return NextResponse.json({ error: 'This link is invalid. Use the link in your latest email.' }, { status: 404 })
  return NextResponse.json({ subscriber: publicView(sub) })
}

export async function POST(req: NextRequest) {
  const tooMany = await limited(req)
  if (tooMany) return tooMany
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const r = await updatePreferences(b.s, b.t, b)
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
}
