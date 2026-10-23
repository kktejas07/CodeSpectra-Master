/**
 * CORE-037: referral rewards held for review because the only link between the
 * two accounts is a shared IP (campus / hostel Wi-Fi).
 *   GET  → { items: [{ id, referrer, referee, due_at, created_at }] } (emails masked)
 *   POST { id, decision: 'grant' | 'void' } → { result }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { limitRequest } from '@/lib/rate-limit'
import { maskEmail } from '@/lib/billing/referral-reward'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { listReviewRewards } = await import('@/lib/billing/referrals')
    const rows = await listReviewRewards()
    return NextResponse.json({
      items: rows.map((r) => ({ id: r.id, referrer: maskEmail(r.referrer_email), referee: maskEmail(r.referee_email), due_at: r.due_at, created_at: r.created_at })),
    })
  } catch (e) {
    console.error('[admin/referrals] list failed:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('internal_error'), { status: 500 })
  }
}

const Body = z.object({ id: z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/), decision: z.enum(['grant', 'void']) }).strict()

export async function POST(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin-referral-review', gate.user.id, 60, 60_000)
  if (limited) return limited
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const { decideReviewReward } = await import('@/lib/billing/referrals')
    const result = await decideReviewReward(parsed.data.id, parsed.data.decision, gate.user.id)
    if (result === 'not_found') return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    return NextResponse.json({ result })
  } catch (e) {
    console.error('[admin/referrals] decision failed:', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('internal_error'), { status: 500 })
  }
}
