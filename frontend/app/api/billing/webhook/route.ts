import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay-server'
import {
  billingOrders,
  billingPayments,
  newId,
  nowIso,
} from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes, markOrderRefunded } from '@/lib/billing-plans'
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
 *   - refund.created/processed → full refund: markOrderRefunded (order, invoice, plan)
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
    await ensureBillingIndexes()
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
        // order (double subscription extension). A failure never un-pays an order
        // and a retried event never revives a refunded one.
        // A captured amount below the order total never activates the order.
        const shortPaid = status === 'captured' && amount < order.amount_paise
        if (shortPaid) console.error('[billing/webhook] short payment', { order: order.id, amount })
        const claim = shortPaid
          ? null
          : await orders.updateOne(
              {
                id: order.id,
                status: { $in: status === 'captured' ? ['created', 'attempted', 'failed'] : ['created', 'attempted'] },
              },
              {
                $set: {
                  status: status === 'captured' ? 'paid' : 'failed',
                  updated_at: nowIso(),
                },
              },
            )
        const claimed = (claim?.modifiedCount ?? 0) > 0

        const paymentRowId = newId()
        try {
          await paymentsCol.updateOne(
            { razorpay_payment_id: payment_id },
            {
              $setOnInsert: {
                id: paymentRowId,
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
        } catch (e) {
          if ((e as { code?: number })?.code !== 11000) throw e
        }
        // Notify only for an event that actually changed the order (D35): a
        // short payment or a lost claim must not say "Payment successful".
        const sym = getCurrencySymbol(order.currency || (await getPlatformCurrency()))
        if (claimed) notify({
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
          // Activate exactly the plan snapshotted on the order (static or admin-created).
          // Read back the row id: an earlier verify call may own the payment row.
          const row = await paymentsCol.findOne({ razorpay_payment_id: payment_id }, { projection: { id: 1 } })
          await activatePaidOrder({ ...order, status: 'paid' }, row?.id ?? paymentRowId)
        }
        if (status === 'failed' && claimed) {
          void import('@/lib/automation/events').then(({ emit }) => emit('payment.failed', { order_id: order.id, user_id: order.user_id, plan_id: order.plan_id, amount_minor: amount, currency: order.currency, provider: 'razorpay', kind: 'checkout' }, { idempotencyKey: `payment.failed:${order.id}` })).catch((e) => console.error('[automation] emit failed:', e))
        }
      }
    } else if (event === 'refund.created' || event === 'refund.processed') {
      // A full refund issued in the Razorpay dashboard: same effect as the
      // admin "Mark refunded" (order, invoice and plan), once (D18).
      const refund = (entities.refund?.entity || {}) as Record<string, unknown>
      const payment_id = String(refund.payment_id || '')
      const refundAmount = Number(refund.amount || 0)
      const paymentsCol = await billingPayments()
      const payment = payment_id ? await paymentsCol.findOne({ razorpay_payment_id: payment_id }) : null
      if (payment) {
        if (refundAmount >= payment.amount_paise) {
          await markOrderRefunded(payment.order_id, { id: 'system:razorpay', email: 'razorpay-webhook' }, `Razorpay refund ${String(refund.id || '')}`.trim())
        } else {
          // Partial refund: record it on the payment only; access is unchanged.
          await paymentsCol.updateOne({ id: payment.id }, { $set: { partial_refund_paise: refundAmount } as never })
        }
      }
    }
    // subscription.* events are ignored: plans are prepaid one-off orders, and
    // Razorpay plan ids are not our plan ids (the old handler cancelled every
    // subscription on a plan).
  } catch (e) {
    console.error('[billing/webhook] error:', e)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
