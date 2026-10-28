import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/payment-methods — saved methods at the gateway, as
 * `{ methods }`. Checkout lives only at /api/billing/checkout (the old POST
 * here was a second checkout path without coupons — removed, D36).
 */
export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    const methods = await ps.listPaymentMethods(user.id, user.email)
    return NextResponse.json({ methods })
  } catch (e) {
    const msg = (e as Error)?.message || ''
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ methods: [] })
    }
    console.error('[payment-methods]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
