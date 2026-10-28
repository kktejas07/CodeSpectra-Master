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
  /** Sequential GST invoice number (lib/billing/tax-invoice.ts); null for zero-amount / legacy orders. */
  invoiceNumber: string | null
  /** Tax snapshot taken when the invoice was numbered. */
  tax: Record<string, unknown> | null
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
    invoiceNumber: order.invoice_number ?? null,
    tax: (order.invoice_tax as Record<string, unknown> | undefined) ?? null,
  }
}

/** The caller's invoice by id, or null if it isn't theirs or isn't an invoice. */
export async function getUserInvoice(userId: string, id: string): Promise<InvoiceView | null> {
  const order = await (await billingOrders()).findOne(
    { id, user_id: userId, status: { $in: INVOICE_STATUSES } },
    { projection: { _id: 0 } },
  )
  if (!order) return null
  // Legacy paid orders get their number the first time the invoice is opened.
  if (!order.invoice_number && order.amount_paise > 0) {
    const { assignInvoice } = await import('./tax-invoice')
    const n = await assignInvoice(order as BillingOrderDoc).catch(() => null)
    if (n) {
      const fresh = await (await billingOrders()).findOne({ id }, { projection: { _id: 0, invoice_number: 1, invoice_tax: 1 } })
      Object.assign(order, fresh)
    }
  }
  const payment = await (await billingPayments()).findOne(
    { order_id: order.id, user_id: userId },
    { projection: { _id: 0 }, sort: { created_at: -1 } },
  )
  return toInvoiceView(order as BillingOrderDoc, (payment as BillingPaymentDoc | null) ?? null)
}
