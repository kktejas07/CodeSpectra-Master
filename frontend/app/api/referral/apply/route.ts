import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { recordReferralRedemption } from '@/lib/referral-service'

/**
 * POST /api/referral/apply { code }
 *
 * Records a pending redemption for the signed-in new account (one per
 * referred user, within REFERRAL_WINDOW_DAYS of sign-up). The referrer's XP
 * is paid later, once this account has a verified e-mail and a first graded
 * activity, and never for two accounts on the same device (CORE-006) —
 * lib/referral-service.ts.
 */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const limited = await limitRequest(request, 'referral-apply', gate.user.id, 5, 10 * 60_000)
  if (limited) return limited

  try {
    const body = (await request.json().catch(() => ({}))) as { code?: unknown }
    const r = await recordReferralRedemption(await getMongoDb(), { id: gate.user.id, email: gate.user.email }, body?.code)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ success: true, status: r.status })
  } catch (e) {
    console.error('[referral/apply] error:', (e as Error)?.message)
    return NextResponse.json({ error: 'Failed to apply referral' }, { status: 500 })
  }
}
