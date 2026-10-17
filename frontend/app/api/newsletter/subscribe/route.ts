/**
 * POST /api/newsletter/subscribe — public. Adds (or re-activates) an email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { newsletterSubscribers, newNewsletterId, nowIso, isEmail } from '@/lib/db/newsletter'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Public endpoint: throttle list-bombing (5 per IP per 10 minutes).
  const limit = await rateLimitRedis(`newsletter:ip:${clientLimiterKeyFromRequest(req, null)}`, 5, 10 * 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
  }
  const body = await req.json().catch(() => ({})) as { email?: string; source?: string }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  try {
    const col = await newsletterSubscribers()
    const now = nowIso()
    const existing = await col.findOne({ email })

    if (existing) {
      if (existing.status === 'unsubscribed') {
        await col.updateOne(
          { _id: existing._id },
          { $set: { status: 'subscribed', unsubscribed_at: null, updated_at: now } },
        )
      }
      return NextResponse.json({ ok: true, already_subscribed: existing.status === 'subscribed' })
    }

    await col.insertOne({
      id: newNewsletterId(),
      email,
      source: typeof body.source === 'string' ? body.source.slice(0, 60) : 'web',
      status: 'subscribed',
      created_at: now,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    console.error('[newsletter] subscribe error:', e)
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 })
  }
}
