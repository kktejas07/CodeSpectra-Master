import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { billingSubscriptions } from '@/lib/db/billing'
import { subState, type SubState } from '@/lib/billing/subscription-state'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATES = new Set<SubState>(['trialing', 'active', 'past_due', 'cancelled', 'expired'])

/** GET /api/admin/billing/subscriptions?state=&cursor= — subscriptions with their lifecycle state. */
export async function GET(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const sp = new URL(req.url).searchParams
  const want = sp.get('state') as SubState | null
  const before = sp.get('before')
  try {
    const now = new Date()
    const q: Record<string, unknown> = {}
    if (before && !Number.isNaN(Date.parse(before))) q.created_at = { $lt: before }
    if (want === 'past_due') Object.assign(q, { status: 'active', past_due: true })
    else if (want === 'expired') q.$or = [{ status: { $ne: 'active' } }, { ends_at: { $lte: now.toISOString() } }]
    else if (want && STATES.has(want)) Object.assign(q, { status: 'active', ends_at: { $gt: now.toISOString() } })
    const rows = await (await billingSubscriptions())
      .find(q as never, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(want && want !== 'past_due' && want !== 'expired' ? 300 : 100)
      .toArray()
    const items = rows
      .map((s) => ({
        id: s.id,
        user: `${String(s.user_id).slice(0, 8)}…`,
        plan_id: s.plan_id,
        state: subState(s, now),
        billing_mode: s.billing_mode ?? 'prepaid',
        ends_at: s.ends_at,
        grace_ends_at: s.past_due ? s.grace_ends_at ?? null : null,
        created_at: s.created_at,
      }))
      .filter((s) => !want || !STATES.has(want) || s.state === want)
      .slice(0, 100)
    return NextResponse.json({ items, next: rows.length ? rows[rows.length - 1].created_at : null })
  } catch (e) {
    console.error('[admin/billing/subscriptions]', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
