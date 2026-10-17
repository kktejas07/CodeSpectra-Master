import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay-server'
import {
  billingOrders,
  billingPayments,
  billingSubscriptions,
  newId,
  nowIso,
  BILLING_PLANS,
} from '@/lib/db/billing'
import { notify } from '@/lib/notifications'
import { getCurrencySymbol } from '@/lib/currency'
import { getPlatformCurrency } from '@/lib/server-currency'

export const runtime = 'nodejs'

/**
 * POST /api/billing/webhook
 *
 * Razorpay webhook receiver. Verifies the `x-razorpay-signature` header
 * against `RAZORPAY_WEBHOOK_SECRET`, then updates the order/payment/subscription
 * collections based on the event.
 *
 * Supported events:
 *   - payment.captured       → mark order paid + insert payment + (re)issue subscription
 *   - payment.failed         → mark order failed + insert failed payment
 *   - refund.created         → mark payment refunded
 *   - subscription.cancelled → mark subscription cancelled
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get('x-razorpay-signature') || ''
  const raw = await req.text()
  if (!(await verifyWebhookSignature(raw, signature))) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let payload: { event?: string; payload?: Record<string, { entity: Record<string, unknown> }> }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const event = payload.event || ''
  const entities = payload.payload || {}

  try {
    if (event === 'payment.captured' || event === 'payment.failed') {
      const pay = (entities.payment?.entity || {}) as Record<string, unknown>
      const order_id = String(pay.order_id || '')
      const payment_id = String(pay.id || '')
      const amount = Number(pay.amount || 0)
      const status =
        event === 'payment.captured' ? ('captured' as const) : ('failed' as const)
      const orders = await billingOrders()
      const order = await orders.findOne({ razorpay_order_id: order_id })
      if (order) {
        const paymentsCol = await billingPayments()
        // Idempotency: Razorpay retries webhooks — never double-insert or double-activate.
        const existingPayment = payment_id
          ? await paymentsCol.findOne({ razorpay_payment_id: payment_id })
          : null
        if (existingPayment) {
          return NextResponse.json({ ok: true, duplicate: true })
        }
        // Atomic claim so the verify route and this webhook can't both apply the
        // order (double subscription extension). A failure never un-pays an order.
        // A captured amount below the order total never activates the order.
        const shortPaid = status === 'captured' && amount < order.amount_paise
        if (shortPaid) console.error('[billing/webhook] short payment', { order: order.id, amount })
        const claim = shortPaid
          ? null
          : await orders.updateOne(
              { id: order.id, status: { $ne: 'paid' } },
              {
                $set: {
                  status: status === 'captured' ? 'paid' : 'failed',
                  updated_at: nowIso(),
                },
              },
            )
        const claimed = (claim?.modifiedCount ?? 0) > 0

        await paymentsCol.updateOne(
          { razorpay_payment_id: payment_id },
          {
            $setOnInsert: {
              id: newId(),
              user_id: order.user_id,
              order_id: order.id,
              razorpay_payment_id: payment_id,
              status,
              amount_paise: amount,
              method: String(pay.method || ''),
              created_at: nowIso(),
              raw_event: pay,
            },
          },
          { upsert: true },
        )
        const sym = getCurrencySymbol(await getPlatformCurrency())
        notify({
          user_id: order.user_id,
          type: status === 'captured' ? 'billing.payment_success' : 'billing.payment_failed',
          title: status === 'captured' ? 'Payment successful' : 'Payment failed',
          message: status === 'captured'
            ? `Payment of ${sym}${(amount / 100).toFixed(2)} completed.`
            : `Payment of ${sym}${(amount / 100).toFixed(2)} failed.`,
          icon: status === 'captured' ? 'credit-card' : 'alert-circle',
          link: '/dashboard/billing',
        }).catch(() => {})
        // Issue / extend / reactivate subscription on captured event.
        // Only the claimer applies the order's effects.
        if (status === 'captured' && claimed) {
          const plan = BILLING_PLANS[order.plan_id]
          if (plan?.kind === 'subscription' && plan.duration_days) {
            const subs = await billingSubscriptions()
            const existing = await subs.findOne({
              user_id: order.user_id,
              status: { $in: ['active', 'expired', 'cancelled'] },
            })
            const now = new Date()
            const durationMs = plan.duration_days * 86400000
            if (existing) {
              const currentEnd = new Date(existing.ends_at)
              const base = currentEnd > now ? currentEnd : now
              const ends_at = new Date(base.getTime() + durationMs).toISOString()
              await subs.updateOne(
                { id: existing.id },
                {
                  $set: {
                    status: 'active',
                    ends_at,
                    plan_id: plan.id,
                    updated_at: nowIso(),
                  },
                },
              )
            } else {
              const ends_at = new Date(now.getTime() + durationMs).toISOString()
              await subs.insertOne({
                id: newId(),
                user_id: order.user_id,
                plan_id: plan.id,
                status: 'active',
                started_at: nowIso(),
                ends_at,
                created_at: nowIso(),
              })
            }
          }
          if (order.coupon_id) {
            const { recordCouponRedemption } = await import('@/lib/db/billing')
            await recordCouponRedemption(order.coupon_id, order.user_id, order.id, order.plan_id).catch(() => {})
          }
        }
      }
    } else if (event === 'refund.created') {
      const refund = (entities.refund?.entity || {}) as Record<string, unknown>
      const payment_id = String(refund.payment_id || '')
      const paymentsCol = await billingPayments()
      await paymentsCol.updateOne(
        { razorpay_payment_id: payment_id },
        { $set: { status: 'refunded' } },
      )
    } else if (event === 'subscription.cancelled') {
      const sub = (entities.subscription?.entity || {}) as Record<string, unknown>
      const planId = String(sub.plan_id || '')
      const subs = await billingSubscriptions()
      await subs.updateMany(
        { plan_id: planId, status: 'active' },
        { $set: { status: 'cancelled' } },
      )
    }
  } catch (e) {
    console.error('[billing/webhook] error:', e)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
