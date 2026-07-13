/**
 * PhonePe transaction status check for client-side verification.
 *
 * Called by the billing page after a PhonePe redirect to verify the
 * transaction status and update local state accordingly.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getPhonePeTransactionStatus } from '@/lib/phonepe-server'
import { billingOrders, billingSubscriptions, BILLING_PLANS, nowIso } from '@/lib/db/billing'
import { notify } from '@/lib/notifications'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const merchantTransactionId = req.nextUrl.searchParams.get('transaction_id')
  if (!merchantTransactionId) {
    return NextResponse.json({ error: 'transaction_id required' }, { status: 400 })
  }

  const orders = await billingOrders()
  const order = await orders.findOne({
    phonepe_transaction_id: merchantTransactionId,
    user_id: user.id,
  })

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // If already paid, return current status
  if (order.status === 'paid') {
    return NextResponse.json({
      status: 'paid',
      order_id: order.id,
      plan_id: order.plan_id,
      amount_paise: order.amount_paise,
    })
  }

  // Query PhonePe for current status
  try {
    const statusResponse = await getPhonePeTransactionStatus(merchantTransactionId)

    if (!statusResponse.success || !statusResponse.data) {
      return NextResponse.json({ status: 'pending', message: statusResponse.message })
    }

    const { state, amount, transactionId } = statusResponse.data

    if (state === 'COMPLETED' || state === 'SUCCESS') {
      // Process the successful payment
      await orders.updateOne(
        { id: order.id },
        { $set: { status: 'paid', updated_at: nowIso() } },
      )

      // Send notification
      notify({
        user_id: user.id,
        type: 'billing.payment_success',
        title: 'Payment successful',
        message: `Payment of ₹${(amount / 100).toFixed(2)} completed via PhonePe.`,
        icon: 'credit-card',
        link: '/dashboard/billing',
      }).catch(() => {})

      // Send confirmation email
      const plan = BILLING_PLANS[order.plan_id]
      const { getMongoDb } = await import('@/lib/mongodb')
      const db = await getMongoDb()
      const dbUser = await db.collection('user').findOne({ _id: user.id })
      if (dbUser?.email && plan) {
        const template = plan.kind === 'subscription'
          ? emailTemplates.subscriptionConfirmation(plan.name, amount, plan.currency)
          : emailTemplates.invoiceNotification(order.receipt, amount, plan.name, plan.currency)
        await sendEmail(dbUser.email, template).catch(console.error)
      }

      // Create/extend subscription for subscription plans
      if (plan?.kind === 'subscription' && plan.duration_days) {
        const subs = await billingSubscriptions()
        const existing = await subs.findOne({ user_id: user.id, status: 'active' })
        const now = new Date()
        const base = existing && new Date(existing.ends_at) > now ? new Date(existing.ends_at) : now
        const ends_at = new Date(base.getTime() + plan.duration_days * 86400000).toISOString()

        if (existing) {
          await subs.updateOne({ id: existing.id }, { $set: { ends_at, plan_id: plan.id } })
        } else {
          const { newId } = await import('@/lib/db/billing')
          await subs.insertOne({
            id: newId(),
            user_id: user.id,
            plan_id: plan.id,
            status: 'active',
            started_at: nowIso(),
            ends_at,
            created_at: nowIso(),
          })
        }
      }

      return NextResponse.json({
        status: 'paid',
        order_id: order.id,
        plan_id: order.plan_id,
        amount_paise: amount,
      })
    } else if (state === 'FAILED') {
      await orders.updateOne(
        { id: order.id },
        { $set: { status: 'failed', updated_at: nowIso() } },
      )
      return NextResponse.json({ status: 'failed' })
    }

    return NextResponse.json({
      status: 'pending',
      state,
      message: statusResponse.message,
    })
  } catch (e) {
    console.error('[PhonePe verify] error:', e)
    return NextResponse.json({
      status: 'error',
      message: String(e),
    }, { status: 500 })
  }
}