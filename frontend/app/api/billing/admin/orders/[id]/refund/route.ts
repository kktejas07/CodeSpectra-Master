import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import type { IdRouteContext } from '@/lib/app-route-context'
import { markOrderRefunded } from '@/lib/billing-plans'
import { writeAuditLog } from '@/lib/db/misc'
import { notify } from '@/lib/notifications'
import { clientLimiterKeyFromRequest, rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  note: z.string().trim().min(5, 'Add a note of at least 5 characters.').max(500),
  confirm: z.literal(true),
})

/**
 * POST /api/billing/admin/orders/[id]/refund { note, confirm: true } — superadmin only.
 * Records a refund that was ALREADY issued in the Razorpay (or PhonePe) dashboard.
 * Does not call any gateway refund API. Marks the order refunded (once, atomically),
 * records who/when/why, and drops the user to Free if this order funded the
 * current subscription period.
 */
export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  if (!id || id.length > 100) return NextResponse.json({ error: 'Invalid order' }, { status: 400 })

  const rl = rateLimitSlidingWindow(`billing-refund:${clientLimiterKeyFromRequest(req, gate.user.id)}`, 20, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : null
    return NextResponse.json({ error: msg && !msg.startsWith('Invalid') ? msg : 'A note and confirmation are required.' }, { status: 400 })
  }

  try {
    const result = await markOrderRefunded(id, { id: gate.user.id, email: gate.user.email }, body.note)
    if (!result.ok) {
      return result.code === 'not_found'
        ? NextResponse.json({ error: 'Payment not found' }, { status: 404 })
        : NextResponse.json({ error: 'Only paid payments can be marked as refunded.' }, { status: 409 })
    }

    const fwd = req.headers.get('x-forwarded-for') || ''
    await writeAuditLog({
      actor: gate.user.email,
      actorIp: req.headers.get('cf-connecting-ip') || fwd.split(',')[0]?.trim() || '',
      action: 'billing.order.mark_refunded',
      resource: result.order.id,
      resourceType: 'billing_order',
      severity: 'warning',
      outcome: 'success',
      detail: JSON.stringify({
        note: body.note,
        user_id: result.order.user_id,
        amount_paise: result.order.amount_paise,
        currency: result.order.currency,
        plan_id: result.order.plan_id,
        downgraded: result.downgraded,
        shortened: result.shortened,
      }),
      user_id: gate.user.id,
    })

    notify({
      user_id: result.order.user_id,
      type: 'billing.payment_refunded',
      title: 'Payment refunded',
      message: result.downgraded
        ? 'Your payment was refunded and your account is now on the Free plan.'
        : 'Your payment was refunded.',
      icon: 'credit-card',
      link: '/dashboard/billing',
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      order_id: result.order.id,
      status: 'refunded',
      refunded_at: result.order.refunded_at,
      downgraded: result.downgraded,
      shortened: result.shortened,
    })
  } catch (e) {
    console.error('[billing/admin/refund] error:', e)
    return NextResponse.json({ error: 'Could not record the refund. Please try again.' }, { status: 500 })
  }
}
