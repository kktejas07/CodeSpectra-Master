/**
 * POST /api/analytics/conversions — the signed-in user's own recent sign-up /
 * purchase conversions that haven't been passed to third-party tags yet
 * (each is returned once). Called by <ThirdPartyTags/> after consent.
 *
 * W4-18: POST (CSRF-checked, never prefetched) and consent is re-checked on the
 * server from the cs_consent cookie — nothing is marked as sent without it.
 * Reads the automation outbox read-only; returns ids, amounts and currency only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { CONSENT_COOKIE, conversionsAllowed } from '@/lib/analytics/consent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  return NextResponse.json({ error: 'Use POST' }, { status: 405, headers: { ...NO_STORE, Allow: 'POST' } })
}

export async function POST(req: NextRequest) {
  if (!conversionsAllowed(req.cookies.get(CONSENT_COOKIE)?.value, req.headers.get('sec-gpc'))) {
    return NextResponse.json({ conversions: [] }, { headers: NO_STORE })
  }
  const user = await getAPIUser().catch(() => null)
  if (!user) return NextResponse.json({ conversions: [] }, { headers: NO_STORE })
  try {
    const db = await getMongoDb()
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const rows = await db.collection('automation_events').find({
      type: { $in: ['user.created', 'payment.succeeded', 'marketplace.order.paid'] },
      created_at: { $gte: since },
      $or: [{ 'payload.user_id': user.id }, { 'payload.buyer_id': user.id }],
    }, { projection: { _id: 0, id: 1, type: 1, payload: 1 } }).limit(20).toArray()
    const sentCol = db.collection<{ _id: string; user_id: string; at: Date }>('analytics_conversions_sent')
    const out: Array<{ type: 'signup' | 'purchase'; id: string; value?: number; currency?: string }> = []
    for (const r of rows) {
      try {
        await sentCol.insertOne({ _id: String(r.id), user_id: user.id, at: new Date() })
      } catch { continue } // already sent
      const p = (r.payload || {}) as Record<string, unknown>
      if (r.type === 'user.created') out.push({ type: 'signup', id: String(r.id) })
      else {
        const minor = Number(p.amount_minor ?? p.total_minor) || 0
        out.push({ type: 'purchase', id: String(p.order_id || r.id).slice(0, 80), value: Math.round(minor) / 100, currency: typeof p.currency === 'string' ? p.currency.slice(0, 3).toUpperCase() : undefined })
      }
    }
    return NextResponse.json({ conversions: out }, { headers: NO_STORE })
  } catch (e) {
    console.error('[analytics] conversions failed:', (e as Error)?.message)
    return NextResponse.json({ conversions: [] }, { headers: NO_STORE })
  }
}
