/**
 * PhonePe callback and webhook handler.
 *
 * PhonePe sends POST callbacks to this endpoint after payment.
 * We verify the webhook signature and update the order status.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyPhonePeWebhook } from '@/lib/phonepe-server'
import { billingOrders, billingPayments, nowIso, newId } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes, storedPlanLabel } from '@/lib/billing-plans'
import { notify } from '@/lib/notifications'
import { getCurrencySymbol } from '@/lib/currency'
import { getPlatformCurrency } from '@/lib/server-currency'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PhonePeWebhookPayload {
  merchantId: string
  merchantTransactionId: string
  transactionId: string
  amount: number
  state: string
  userId?: string
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // PhonePe sends X-Verification-Header for webhook verification
  const signature = req.headers.get('X-Verification-Header') || ''

  // Verify webhook signature
  const isValid = await verifyPhonePeWebhook(rawBody, signature)
  if (!isValid) {
    console.error('[PhonePe] Invalid webhook signature')
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
  }

  let payload: PhonePeWebhookPayload
  try {
    payload = JSON.parse(rawBody) as PhonePeWebhookPayload
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { merchantTransactionId, state, transactionId, amount } = payload

  logger.webhook(`[PhonePe] Webhook: ${merchantTransactionId} -> ${state}`)

  try {
    await ensureBillingIndexes()
    const orders = await billingOrders()

    // Find the order by PhonePe transaction ID
    const order = await orders.findOne({ phonepe_transaction_id: merchantTransactionId })
    if (!order) {
      console.error('[PhonePe] Order not found:', merchantTransactionId)
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    if (state === 'COMPLETED' || state === 'SUCCESS') {
      if (amount && amount < order.amount_paise) {
        console.error('[PhonePe] short payment', { order: order.id, amount })
        return NextResponse.json({ success: true })
      }
      // Idempotency: PhonePe retries webhooks and the redirect callback may get
      // here first — only the atomic claimer applies the order. A refunded
      // order is never revived.
      const claim = await orders.updateOne(
        { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
        { $set: { status: 'paid', updated_at: nowIso() } },
      )
      if (claim.modifiedCount === 0) {
        return NextResponse.json({ success: true })
      }

      const finalAmount = amount || order.amount_paise
      const paymentRowId = newId()
      try {
        await (await billingPayments()).updateOne(
          { phonepe_payment_id: transactionId },
          {
            $setOnInsert: {
              id: paymentRowId,
              user_id: order.user_id,
              order_id: order.id,
              razorpay_payment_id: '',
              phonepe_payment_id: transactionId,
              status: 'captured',
              amount_paise: finalAmount,
              created_at: nowIso(),
            },
          },
          { upsert: true },
        )
      } catch (e) {
        if ((e as { code?: number })?.code !== 11000) throw e
      }

      // Activate exactly the plan snapshotted on the order (static or admin-created).
      const { subscription } = await activatePaidOrder({ ...order, status: 'paid' }, paymentRowId)
      if (subscription) {
        logger.webhook(`[PhonePe] Subscription active for user ${order.user_id}, ends ${subscription.ends_at}`)
      }

      const sym = getCurrencySymbol(await getPlatformCurrency())
      notify({
        user_id: order.user_id,
        type: 'billing.payment_success',
        title: 'Payment successful',
        message: `Payment of ${sym}${(finalAmount / 100).toFixed(2)} completed via PhonePe.`,
        icon: 'credit-card',
        link: '/dashboard/billing',
      }).catch(() => {})

      // Confirmation email
      const planName = storedPlanLabel(order) || 'CodeSpectra plan'
      const db = await getMongoDb()
      const user = await db.collection('user').findOne({ id: order.user_id })
      if (user?.email) {
        const template = order.plan_kind === 'one_time'
          ? emailTemplates.invoiceNotification(order.receipt, finalAmount, planName, order.currency)
          : emailTemplates.subscriptionConfirmation(planName, finalAmount, order.currency)
        await sendEmail(user.email, template).catch(console.error)
      }

      logger.webhook(`[PhonePe] Payment completed for order: ${merchantTransactionId}`)
      return NextResponse.json({ success: true })

    } else if (state === 'FAILED') {
      await orders.updateOne(
        { id: order.id, status: { $in: ['created', 'attempted'] } },
        { $set: { status: 'failed', updated_at: nowIso() } }
      )

      const sym = getCurrencySymbol(await getPlatformCurrency())
      notify({
        user_id: order.user_id,
        type: 'billing.payment_failed',
        title: 'Payment failed',
        message: `PhonePe payment of ${sym}${(amount / 100).toFixed(2)} failed.`,
        icon: 'alert-circle',
        link: '/dashboard/billing',
      }).catch(() => {})

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true })

  } catch (e) {
    console.error('[PhonePe] Webhook processing error:', e)
    return NextResponse.json({ success: false, error: 'Processing error' }, { status: 500 })
  }
}