import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { PaymentService } from '@/lib/payment-service'
import { billingSubscriptions, nowIso } from '@/lib/db/billing'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ps = new PaymentService()
    const subscription = await ps.getSubscription(user.id)
    return NextResponse.json({ subscription })
  } catch (error) {
    console.error('[billing/subscription] GET:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateCheck = await rateLimitAIRedis(req, user.id)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
    }

    const { plan_id } = (await req.json()) as { plan_id?: string }
    if (!plan_id) return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })

    const subs = await billingSubscriptions()
    const active = await subs.findOne({ user_id: user.id, status: 'active' })
    const now = new Date()
    const endsAt = new Date(now.getTime() + 30 * 86400000).toISOString()

    if (active) {
      await subs.updateOne({ id: active.id }, { $set: { plan_id, updated_at: nowIso(), ends_at: endsAt } })
    } else {
      const { newId } = await import('@/lib/db/billing')
      await subs.insertOne({
        id: newId(),
        user_id: user.id,
        plan_id,
        status: 'active',
        started_at: nowIso(),
        ends_at: endsAt,
        created_at: nowIso(),
      })
    }

    return NextResponse.json({ ok: true, plan_id })
  } catch (error) {
    console.error('[billing/subscription] PUT:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
