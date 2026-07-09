import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    const methods = await ps.listPaymentMethods(user.id, user.email)
    return NextResponse.json({ methods })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ error: msg }, { status: 503 })
    }
    console.error('[payment-methods]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { plan_id, country } = (await req.json()) as { plan_id?: string; country?: string }
    const ps = new PaymentService()
    const result = await ps.createCheckout(user.id, user.email, plan_id || 'pro_monthly', country)

    return NextResponse.json({
      redirect: result.provider === 'stripe',
      url: result.redirect_url,
      message: result.provider === 'razorpay' ? 'Complete payment via Razorpay' : undefined,
      checkout: result,
    })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ error: msg }, { status: 503 })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
