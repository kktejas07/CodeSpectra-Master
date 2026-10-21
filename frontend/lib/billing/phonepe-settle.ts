/**
 * Settle a PhonePe order from the gateway's own status API (never from the
 * callback body or the browser redirect). Shared by the browser return route
 * (/api/billing/phonepe-callback) and the S2S callback (/api/billing/phonepe-webhook).
 *
 * NEEDS A SANDBOX TEST (PhonePe PG v1) — see lib/phonepe-server.ts.
 */
import 'server-only'
import { getPhonePeTransactionStatus } from '@/lib/phonepe-server'
import { billingOrders, billingPayments, newId, nowIso } from '@/lib/db/billing'
import { activatePaidOrder, ensureBillingIndexes, storedPlanLabel } from '@/lib/billing-plans'
import { getMongoDb } from '@/lib/mongodb'
import { notify } from '@/lib/notifications'
import { getCurrencySymbol } from '@/lib/currency'
import { sendEmail } from '@/lib/send-email'
import { emailTemplatesFor } from '@/lib/email-templates'
import { recipientLocaleFrom } from '@/lib/i18n/recipient'

export type SettleOutcome = 'success' | 'failed' | 'pending' | 'unknown'

export async function settlePhonePeOrder(merchantTransactionId: string): Promise<SettleOutcome> {
  if (!/^[A-Za-z0-9_-]{1,35}$/.test(merchantTransactionId)) return 'unknown'
  await ensureBillingIndexes()
  const orders = await billingOrders()
  const order = await orders.findOne({ phonepe_transaction_id: merchantTransactionId })
  if (!order) return 'unknown'
  if (order.status === 'paid') return 'success'
  if (order.status === 'refunded') return 'failed'

  const st = await getPhonePeTransactionStatus(merchantTransactionId)
  const data = st.data
  const state = data?.state
  const sameTxn = data?.merchantTransactionId === merchantTransactionId

  if (st.success && sameTxn && state === 'COMPLETED' && st.code === 'PAYMENT_SUCCESS') {
    const amount = Number(data?.amount ?? 0)
    // Never activate a short payment.
    if (!Number.isInteger(amount) || amount < order.amount_paise) {
      console.error('[phonepe] short or missing amount', { order: order.id, amount })
      return 'failed'
    }
    // Atomic claim: the return route and the S2S callback can't both apply it.
    const claim = await orders.updateOne(
      { id: order.id, status: { $in: ['created', 'attempted', 'failed'] } },
      { $set: { status: 'paid', updated_at: nowIso() } },
    )
    if (claim.modifiedCount === 0) return 'success'

    const gatewayTxn = String(data?.transactionId || merchantTransactionId)
    const payments = await billingPayments()
    try {
      await payments.updateOne(
        { phonepe_payment_id: gatewayTxn },
        {
          $setOnInsert: {
            id: newId(),
            user_id: order.user_id,
            order_id: order.id,
            razorpay_payment_id: '',
            phonepe_payment_id: gatewayTxn,
            status: 'captured',
            amount_paise: amount,
            created_at: nowIso(),
          },
        },
        { upsert: true },
      )
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e
    }
    const paymentRow = await payments.findOne({ phonepe_payment_id: gatewayTxn }, { projection: { id: 1 } })
    await activatePaidOrder({ ...order, status: 'paid' }, paymentRow?.id)

    const sym = getCurrencySymbol(order.currency)
    notify({
      user_id: order.user_id,
      type: 'billing.payment_success',
      title: 'Payment successful',
      message: `Payment of ${sym}${(amount / 100).toFixed(2)} completed via PhonePe.`,
      title_i18n: { key: 'billing.success.title' },
      message_i18n: { key: 'billing.paidPhonePe.message', params: { amount: `${sym}${(amount / 100).toFixed(2)}` } },
      icon: 'credit-card',
      link: '/dashboard/billing',
    }).catch(() => {})

    const planName = storedPlanLabel(order) || 'CodeSpectra plan'
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ $or: [{ id: order.user_id }, { _id: order.user_id }] } as never)
    if (user?.email) {
      const emailTemplates = emailTemplatesFor(recipientLocaleFrom(user as { ui_locale?: unknown }))
      const template = order.plan_kind === 'one_time'
        ? emailTemplates.invoiceNotification(order.receipt, amount, planName, order.currency)
        : emailTemplates.subscriptionConfirmation(planName, amount, order.currency)
      await sendEmail(user.email as string, template).catch(console.error)
    }
    return 'success'
  }

  if (sameTxn && state === 'FAILED') {
    const r = await orders.updateOne(
      { id: order.id, status: { $in: ['created', 'attempted'] } },
      { $set: { status: 'failed', updated_at: nowIso() } },
    )
    if (r.modifiedCount) void import('@/lib/automation/events').then(({ emit }) => emit('payment.failed', { order_id: order.id, user_id: order.user_id, plan_id: order.plan_id, amount_minor: order.amount_paise, currency: order.currency, provider: 'phonepe', kind: 'checkout' }, { idempotencyKey: `payment.failed:${order.id}` })).catch((e) => console.error('[automation] emit failed:', e))
    return 'failed'
  }
  return 'pending'
}
