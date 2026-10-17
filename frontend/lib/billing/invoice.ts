/**
 * Invoice (receipt) lookup built from the user's own billing_orders and
 * billing_payments rows. Only paid or refunded orders count as invoices;
 * abandoned checkouts ("created"/"attempted"/"failed") are not shown.
 */
import { billingOrders, billingPayments, type BillingOrderDoc, type BillingPaymentDoc } from '@/lib/db/billing'
import { storedPlanLabel } from '@/lib/billing-plans'

export const INVOICE_STATUSES: BillingOrderDoc['status'][] = ['paid', 'refunded']

export interface InvoiceView {
  id: string
  amount: number
  currency: string
  status: string
  description: string | null
  createdAt: string
  downloadUrl: string
  receipt: string
  paymentId: string | null
  paymentMethod: string | null
  /** Set when an admin recorded a refund for this order. */
  refundedAt: string | null
}


export function toInvoiceView(order: BillingOrderDoc, payment: BillingPaymentDoc | null): InvoiceView {
  return {
    id: order.id,
    amount: (order.amount_paise || 0) / 100,
    currency: order.currency || 'INR',
    status: order.status,
    description: storedPlanLabel(order),
    createdAt: order.created_at,
    downloadUrl: `/api/billing/invoices/${encodeURIComponent(order.id)}/download`,
    receipt: order.receipt,
    paymentId: payment?.razorpay_payment_id || payment?.phonepe_payment_id || null,
    paymentMethod: payment?.method || null,
    refundedAt: order.status === 'refunded' ? order.refunded_at || order.updated_at || null : null,
  }
}

/** The caller's invoice by id, or null if it isn't theirs or isn't an invoice. */
export async function getUserInvoice(userId: string, id: string): Promise<InvoiceView | null> {
  const order = await (await billingOrders()).findOne(
    { id, user_id: userId, status: { $in: INVOICE_STATUSES } },
    { projection: { _id: 0 } },
  )
  if (!order) return null
  const payment = await (await billingPayments()).findOne(
    { order_id: order.id, user_id: userId },
    { projection: { _id: 0 }, sort: { created_at: -1 } },
  )
  return toInvoiceView(order as BillingOrderDoc, (payment as BillingPaymentDoc | null) ?? null)
}
