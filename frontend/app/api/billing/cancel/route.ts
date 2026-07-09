import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import { nowIso } from '@/lib/db/billing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    await ps.cancelSubscription(user.id)

    return NextResponse.json({ ok: true, cancelled_at: nowIso() })
  } catch (error) {
    const msg = (error as Error).message
    console.error('[billing/cancel]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
