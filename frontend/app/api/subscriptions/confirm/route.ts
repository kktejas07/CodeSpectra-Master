/**
 * POST /api/subscriptions/confirm — public. Body: { token }.
 * POST (from the /subscriptions/confirm button), not GET, so mail scanners that
 * prefetch links can't confirm for someone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { confirmEmail } from '@/lib/subscriptions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const limit = await rateLimitRedis(`subs:confirm-ip:${clientLimiterKeyFromRequest(req, null)}`, 20, 10 * 60_000)
  if (!limit.ok) return NextResponse.json({ error: `Too many requests. Try again in ${limit.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: limit.retryAfterSec } }, { status: 429 })
  const body = (await req.json().catch(() => ({}))) as { token?: unknown }
  try {
    const r = await confirmEmail(body.token)
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
  } catch (e) {
    console.error('[subscriptions] confirm failed:', (e as Error).message)
    return NextResponse.json({ error: 'Couldn’t confirm right now. Try again later.' }, { status: 500 })
  }
}
