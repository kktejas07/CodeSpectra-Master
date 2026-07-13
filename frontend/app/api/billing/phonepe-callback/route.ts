/**
 * PhonePe redirect callback — the URL users are sent to after completing
 * or abandoning a PhonePe payment.
 *
 * PhonePe POSTs to this endpoint with merchantTransactionId and state.
 * We verify the transaction status, update the order, then redirect the
 * browser to /dashboard/billing with an appropriate status param.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPhonePeTransactionStatus } from '@/lib/phonepe-server'
import {
  billingOrders,
  billingPayments,
  billingSubscriptions,
  BILLING_PLANS,
  newId,
  nowIso,
} from '@/lib/db/billing'
import { getMongoDb } from '@/lib/mongodb'
import { notify } from '@/lib/notifications'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let merchantTransactionId = ''
  let state = ''

  const contentType = req.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      merchantTransactionId = String(body.merchantTransactionId || '')
      state = String(body.state || body.status || '')
    } else {
      const formData = await req.formData()
      merchantTransactionId = String(formData.get('merchantTransactionId') || '')
      state = String(formData.get('state') || formData.get('status') || '')
    }
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?payment=phonepe&status=failed`)
  }

  if (!merchantTransactionId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?payment=phonepe&status=failed`)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.com'
  let status = 'failed'

  try {
    // First check if PhonePe indicated success directly
    if (state === 'COMPLETED' || state === 'SUCCESS') {
      await processSuccessfulPayment(merchantTransactionId, 0, '')
      status = 'success'
    } else {
      // Query PhonePe for actual status
      const statusResponse = await getPhonePeTransactionStatus(merchantTransactionId)
      if (statusResponse.success && statusResponse.data) {
        state = statusResponse.data.state
        if (state === 'COMPLETED' || state === 'SUCCESS') {
          status = 'success'
          await processSuccessfulPayment(merchantTransactionId, statusResponse.data.amount, statusResponse.data.transactionId)
        }
      }
    }
  } catch (e) {
    console.error('[PhonePe callback] error:', e)
    status = 'failed'
  }

  return NextResponse.redirect(`${baseUrl}/dashboard/billing?payment=phonepe&status=${status}`)
}

async function processSuccessfulPayment(merchantTransactionId: string, amount: number, transactionId: string) {
  const orders = await billingOrders()
  const order = await orders.findOne({ phonepe_transaction_id: merchantTransactionId })
  if (!order) return

  if (order.status === 'paid') return // already processed

  await orders.updateOne(
    { id: order.id },
    { $set: { status: 'paid', updated_at: nowIso() } },
  )

  const finalAmount = amount || order.amount_paise
  const payments = await billingPayments()
  await payments.insertOne({
    id: newId(),
    user_id: order.user_id,
    order_id: order.id,
    razorpay_payment_id: '',
    phonepe_payment_id: transactionId,
    status: 'captured',
    amount_paise: finalAmount,
    created_at: nowIso(),
  })

  notify({
    user_id: order.user_id,
    type: 'billing.payment_success',
    title: 'Payment successful',
    message: `Payment of ₹${(finalAmount / 100).toFixed(2)} completed via PhonePe.`,
    icon: 'credit-card',
    link: '/dashboard/billing',
  }).catch(() => {})

  // Send confirmation email
  const plan = BILLING_PLANS[order.plan_id]
  if (plan) {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ _id: order.user_id })
    if (user?.email) {
      const template = plan.kind === 'subscription'
        ? emailTemplates.subscriptionConfirmation(plan.name, finalAmount, plan.currency)
        : emailTemplates.invoiceNotification(order.receipt, finalAmount, plan.name, plan.currency)
      await sendEmail(user.email, template).catch(console.error)
    }
  }

  // Create/extend subscription
  const subPlan = BILLING_PLANS[order.plan_id]
  if (subPlan?.kind === 'subscription' && subPlan.duration_days) {
    const subs = await billingSubscriptions()
    const existing = await subs.findOne({ user_id: order.user_id, status: 'active' })
    const now = new Date()
    const base = existing && new Date(existing.ends_at) > now ? new Date(existing.ends_at) : now
    const ends_at = new Date(base.getTime() + subPlan.duration_days * 86400000).toISOString()

    if (existing) {
      await subs.updateOne(
        { id: existing.id },
        { $set: { ends_at, plan_id: subPlan.id } },
      )
    } else {
      await subs.insertOne({
        id: newId(),
        user_id: order.user_id,
        plan_id: subPlan.id,
        status: 'active',
        started_at: nowIso(),
        ends_at,
        created_at: nowIso(),
      })
    }
  }
}