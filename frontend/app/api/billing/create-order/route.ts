import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** @deprecated Use POST /api/billing/checkout instead */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { plan_id } = (await req.json()) as { plan_id?: string }
    const ps = new PaymentService()
    const result = await ps.createCheckout(user.id, user.email, plan_id || 'pro_monthly')
    return NextResponse.json(result)
  } catch (error) {
    const msg = (error as Error).message
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ error: msg }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
