/**
 * POST /api/newsletter/confirm — public. Body: { token }.
 * Re-subscribes a previously unsubscribed email, but only with the signed,
 * 48-hour link sent by /api/newsletter/subscribe. POST (from the
 * /newsletter/confirm page button) rather than GET, so mail scanners that
 * prefetch links can't confirm on someone's behalf.
 */
import { NextRequest, NextResponse } from 'next/server'
import { newsletterSubscribers, nowIso } from '@/lib/db/newsletter'
import { verifyPurposeToken } from '@/lib/session'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ResubscribeToken { email: string; id: string; u: string | null }

export async function POST(req: NextRequest) {
  const limit = await rateLimitRedis(`newsletter:confirm-ip:${clientLimiterKeyFromRequest(req, null)}`, 20, 10 * 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${limit.retryAfterSec}s.`, code: 'rate_limited_seconds', params: { seconds: limit.retryAfterSec } }, { status: 429 })
  }
  const body = (await req.json().catch(() => ({}))) as { token?: unknown }
  const token = typeof body.token === 'string' ? body.token : ''
  const data = await verifyPurposeToken<ResubscribeToken>('newsletter_resubscribe', token)
  if (!data || typeof data.email !== 'string' || typeof data.id !== 'string') {
    return NextResponse.json({ error: 'This link is invalid or has expired. Subscribe again to get a new one.' }, { status: 400 })
  }

  try {
    const col = await newsletterSubscribers()
    const existing = await col.findOne({ id: data.id, email: data.email })
    if (!existing) {
      return NextResponse.json({ error: 'This link is invalid or has expired. Subscribe again to get a new one.' }, { status: 400 })
    }
    if (existing.status === 'subscribed') {
      return NextResponse.json({ ok: true, already_subscribed: true })
    }
    // Only flip the exact opt-out this link was issued for (atomic, single use).
    const res = await col.updateOne(
      { id: data.id, email: data.email, status: 'unsubscribed', unsubscribed_at: data.u ?? null },
      { $set: { status: 'subscribed', unsubscribed_at: null, resubscribed_at: nowIso(), updated_at: nowIso() } },
    )
    if (res.modifiedCount === 0) {
      return NextResponse.json({ error: 'This link is no longer valid. Subscribe again to get a new one.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[newsletter] confirm error:', e)
    return NextResponse.json({ error: 'Failed to confirm your subscription' }, { status: 500 })
  }
}
