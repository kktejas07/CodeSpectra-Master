import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateCheck = await rateLimitAIRedis(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { plan_id, country } = (await req.json()) as { plan_id?: string; country?: string }

    const ps = new PaymentService()
    const result = await ps.createCheckout(user.id, user.email, plan_id || 'pro_monthly', country)

    return NextResponse.json(result)
  } catch (error) {
    const msg = (error as Error).message
    console.error('[billing/checkout]', msg)
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json(
        { error: "Payments aren't set up yet. Contact us to upgrade your plan.", code: 'payments_not_configured' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
