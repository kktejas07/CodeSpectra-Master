/**
 * PhonePe callback and webhook handler.
 *
 * PhonePe sends POST callbacks to this endpoint after payment.
 * We verify the webhook signature and update the order status.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyPhonePeWebhook } from '@/lib/phonepe-server'
import { billingOrders, billingPayments, billingSubscriptions, BILLING_PLANS, nowIso, newId } from '@/lib/db/billing'
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
    const orders = await billingOrders()

    // Find the order by PhonePe transaction ID
    const order = await orders.findOne({ phonepe_transaction_id: merchantTransactionId })
    if (!order) {
      console.error('[PhonePe] Order not found:', merchantTransactionId)
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    if (state === 'COMPLETED' || state === 'SUCCESS') {
      // Payment successful
      await orders.updateOne(
        { id: order.id },
        { $set: { status: 'paid', updated_at: nowIso() } }
      )

      // Create payment record
      const payments = await billingPayments()
      await payments.insertOne({
        id: newId(),
        user_id: order.user_id,
        order_id: order.id,
        razorpay_payment_id: '',
        phonepe_payment_id: transactionId,
        status: 'captured',
        amount_paise: amount,
        created_at: nowIso(),
      })

      const sym = getCurrencySymbol(await getPlatformCurrency())
      notify({
        user_id: order.user_id,
        type: 'billing.payment_success',
        title: 'Payment successful',
        message: `Payment of ${sym}${(amount / 100).toFixed(2)} completed via PhonePe.`,
        icon: 'credit-card',
        link: '/dashboard/billing',
      }).catch(() => {})

      // Send confirmation email
      const plan = BILLING_PLANS[order.plan_id]
      const { getMongoDb } = await import('@/lib/mongodb')
      const db = await getMongoDb()
      const user = await db.collection('user').findOne({ _id: order.user_id as any })
      if (user?.email && plan) {
        const template = plan.kind === 'subscription'
          ? emailTemplates.subscriptionConfirmation(plan.name, amount, plan.currency)
          : emailTemplates.invoiceNotification(order.receipt, amount, plan.name, plan.currency)
        await sendEmail(user.email, template).catch(console.error)
      }

      // Create or extend subscription
      const subs = await billingSubscriptions()
      const planInfo = plan?.kind === 'subscription' && plan.duration_days
        ? { durationDays: plan.duration_days }
        : { durationDays: 30 }
      const now = new Date()
      const endsAt = new Date(now.getTime() + planInfo.durationDays * 24 * 60 * 60 * 1000).toISOString()

      const existingSub = await subs.findOne({ user_id: order.user_id, status: 'active' })

      if (existingSub) {
        // Extend existing subscription
        const currentEnd = new Date(existingSub.ends_at)
        const newEnd = new Date(currentEnd.getTime() + planInfo.durationDays * 24 * 60 * 60 * 1000)
        await subs.updateOne(
          { id: existingSub.id },
          { $set: { ends_at: newEnd.toISOString(), last_payment_id: transactionId } }
        )
      } else {
        // Create new subscription
        await subs.insertOne({
          id: newId(),
          user_id: order.user_id,
          plan_id: order.plan_id,
          status: 'active',
          started_at: now.toISOString(),
          ends_at: endsAt,
          last_payment_id: transactionId,
          created_at: now.toISOString(),
        })
      }

      logger.webhook(`[PhonePe] Payment completed for order: ${merchantTransactionId}`)
      return NextResponse.json({ success: true })

    } else if (state === 'FAILED') {
      await orders.updateOne(
        { id: order.id },
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