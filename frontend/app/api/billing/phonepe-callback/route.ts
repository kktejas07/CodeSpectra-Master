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
import { billingOrders, billingPayments, newId, nowIso } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes, storedPlanLabel } from '@/lib/billing-plans'
import { getMongoDb } from '@/lib/mongodb'
import { notify } from '@/lib/notifications'
import { getCurrencySymbol } from '@/lib/currency'
import { getPlatformCurrency } from '@/lib/server-currency'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let merchantTransactionId = ''

  const contentType = req.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      merchantTransactionId = String(body.merchantTransactionId || '')
    } else {
      const formData = await req.formData()
      merchantTransactionId = String(formData.get('merchantTransactionId') || '')
    }
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?payment=phonepe&status=failed`)
  }

  if (!merchantTransactionId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?payment=phonepe&status=failed`)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let status = 'failed'

  try {
    // NEVER trust the state claimed by the callback body — anyone can POST
    // `state: 'COMPLETED'`. Always re-check the transaction server-side.
    const statusResponse = await getPhonePeTransactionStatus(merchantTransactionId)
    if (statusResponse.success && statusResponse.data) {
      const verifiedState = statusResponse.data.state
      if (verifiedState === 'COMPLETED' || verifiedState === 'SUCCESS') {
        status = 'success'
        await processSuccessfulPayment(merchantTransactionId, statusResponse.data.amount, statusResponse.data.transactionId)
      } else if (verifiedState === 'FAILED') {
        status = 'failed'
      } else {
        status = 'pending'
      }
    }
  } catch (e) {
    console.error('[PhonePe callback] error:', e)
    status = 'failed'
  }

  return NextResponse.redirect(`${baseUrl}/dashboard/billing?payment=phonepe&status=${status}`)
}

async function processSuccessfulPayment(merchantTransactionId: string, amount: number, transactionId: string) {
  await ensureBillingIndexes()
  const orders = await billingOrders()
  const order = await orders.findOne({ phonepe_transaction_id: merchantTransactionId })
  if (!order) return

  // Never activate a short payment.
  if (amount && amount < order.amount_paise) {
    console.error('[PhonePe callback] short payment', { order: order.id, amount })
    return
  }

  // Atomic claim: the callback and the webhook can't both apply the order,
  // and a refunded order is never revived.
  const claim = await orders.updateOne(
    { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
    { $set: { status: 'paid', updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) return

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
  await activatePaidOrder({ ...order, status: 'paid' }, paymentRowId)

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
}
