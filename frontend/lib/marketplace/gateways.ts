/**
 * Marketplace payments over the existing gateways (INR: PhonePe, else Razorpay, else Stripe;
 * USD: Stripe). Marketplace references never collide with plan billing:
 *   Razorpay Payment Link, reference_id = "MKT" + order id (CORE-039); payment.ref = plink id;
 *            callback → /api/marketplace/webhooks/razorpay/return, webhook payment_link.* on
 *            the shared /api/billing/webhook (signature-verified there).
 *   PhonePe  merchantTransactionId = "MKT" + order id (hex, 35 chars); S2S callback and browser
 *            return go to /api/marketplace/webhooks/phonepe[/return] (passed per payment).
 *   Stripe   Checkout Session with metadata.mkt_order_id + client_reference_id "mkt_<id>"; the
 *            shared /api/billing/stripe-webhook hands such sessions to the marketplace before
 *            plan billing looks at them (and /api/marketplace/webhooks/stripe works too).
 */
import 'server-only'
import type Stripe from 'stripe'
import { getAppOrigin } from '@/lib/app-origin'
import { createPhonePePayment, getPhonePeTransactionStatus, isPhonePeConfiguredAsync, refundPhonePePayment } from '@/lib/phonepe-server'
import { getStripeClient, getStripeSecretKey } from '@/lib/stripe-client'
import { cancelPaymentLink, createPaymentLink, fetchPaymentLinkState, isRazorpayConfigured, refundRazorpayPayment } from '@/lib/razorpay-links'
import type { Currency } from './contract'
import { RESERVATION_MS, type OrderDoc } from './order-doc'

export const phonePeTxnFor = (orderId: string) => `MKT${orderId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 35)
export const isMarketplaceTxn = (txn: string) => /^MKT[A-Za-z0-9]{1,32}$/.test(txn)

export async function pickGateway(currency: Currency): Promise<'phonepe' | 'razorpay' | 'stripe' | null> {
  if (currency === 'INR' && (await isPhonePeConfiguredAsync())) return 'phonepe'
  if (currency === 'INR' && (await isRazorpayConfigured())) return 'razorpay'
  if (await getStripeSecretKey()) return 'stripe'
  return null
}

export async function startPayment(order: OrderDoc): Promise<{ redirect_url: string; ref: string }> {
  const origin = getAppOrigin()
  if (order.payment.gateway === 'phonepe') {
    const txn = phonePeTxnFor(order.id)
    const { payUrl } = await createPhonePePayment({
      merchantTransactionId: txn,
      amount: order.grand_total,
      userId: order.buyer_id,
      redirectUrl: `${origin}/api/marketplace/webhooks/phonepe/return?txn=${txn}`,
      callbackUrl: `${origin}/api/marketplace/webhooks/phonepe`,
    })
    return { redirect_url: payUrl, ref: txn }
  }
  if (order.payment.gateway === 'razorpay') {
    const link = await createPaymentLink({
      amount: order.grand_total,
      currency: order.currency,
      referenceId: phonePeTxnFor(order.id),
      description: `CodeSpectra marketplace order ${order.number}: ${order.lines.map((l) => `${l.qty} × ${l.title}`).join(', ')}`,
      email: order.buyer_email,
      callbackUrl: `${origin}/api/marketplace/webhooks/razorpay/return?order=${encodeURIComponent(order.id)}`,
      // Same window as the stock / slot reservation (Razorpay's minimum is 15 minutes).
      expireBy: Math.floor((Date.now() + RESERVATION_MS + 60_000) / 1000),
      notes: { mkt_order_id: order.id, kind: 'marketplace' },
    })
    return { redirect_url: link.url, ref: link.id }
  }
  const stripe = await getStripeClient()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: order.buyer_email || undefined,
    client_reference_id: `mkt_${order.id}`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: order.grand_total,
        product_data: { name: `CodeSpectra marketplace order ${order.number}`, description: order.lines.map((l) => `${l.qty} × ${l.title}`).join(', ').slice(0, 480) },
      },
    }],
    metadata: { mkt_order_id: order.id, kind: 'marketplace' },
    payment_intent_data: { metadata: { mkt_order_id: order.id, kind: 'marketplace' } },
    // Stripe's minimum is 30 minutes — the same window as our stock/slot reservation.
    expires_at: Math.floor((Date.now() + Math.max(RESERVATION_MS, 30 * 60_000) + 60_000) / 1000),
    success_url: `${origin}/dashboard/orders/${order.id}?paid=1`,
    cancel_url: `${origin}/marketplace/cart?canceled=1`,
  }, { idempotencyKey: `mkt-checkout-${order.id}` })
  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return { redirect_url: session.url, ref: session.id }
}

/** Is this Stripe Checkout Session a marketplace one? Returns our order id. */
export function marketplaceOrderIdFromSession(session: Pick<Stripe.Checkout.Session, 'metadata' | 'client_reference_id'>): string | null {
  const id = session.metadata?.mkt_order_id || (session.client_reference_id?.startsWith('mkt_') ? session.client_reference_id.slice(4) : '')
  return id && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

export type GatewayState = { state: 'paid'; amount: number; currency: string; txn: string; intent?: string | null } | { state: 'failed' | 'pending' | 'unknown' }

/** Authoritative status from the gateway (never trust the browser or the callback body). */
export async function fetchGatewayState(order: OrderDoc): Promise<GatewayState> {
  const ref = order.payment.ref
  if (!ref) return { state: 'unknown' }
  if (order.payment.gateway === 'phonepe') {
    const st = await getPhonePeTransactionStatus(ref)
    const d = st.data
    if (d?.merchantTransactionId !== ref) return { state: 'unknown' }
    if (st.success && d.state === 'COMPLETED' && st.code === 'PAYMENT_SUCCESS') return { state: 'paid', amount: Number(d.amount ?? 0), currency: 'INR', txn: String(d.transactionId || ref) }
    if (d.state === 'FAILED') return { state: 'failed' }
    return { state: 'pending' }
  }
  if (order.payment.gateway === 'razorpay') return fetchPaymentLinkState(ref, phonePeTxnFor(order.id))
  const stripe = await getStripeClient()
  const s = await stripe.checkout.sessions.retrieve(ref)
  if (s.payment_status === 'paid') {
    const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
    return { state: 'paid', amount: Number(s.amount_total ?? 0), currency: String(s.currency || '').toUpperCase(), txn: intent || s.id, intent }
  }
  if (s.status === 'expired') return { state: 'failed' }
  return { state: 'pending' }
}

/**
 * Close the payment page of an order that will not be paid (replaced by a newer checkout,
 * CORE-022). Stripe: expire the Checkout Session so the old tab can't take money. PhonePe has
 * no cancel API — a late PhonePe payment on a replaced order is refunded in settle.ts.
 * Best effort: returns false when the session could not be expired (already paid/expired, or Stripe down).
 */
export async function closePaymentPage(order: Pick<OrderDoc, 'payment'>): Promise<boolean> {
  const ref = order.payment.ref
  if (order.payment.gateway === 'razorpay' && ref) return cancelPaymentLink(ref)
  if (order.payment.gateway !== 'stripe' || !ref || !ref.startsWith('cs_')) return false
  try {
    const stripe = await getStripeClient()
    await stripe.checkout.sessions.expire(ref)
    return true
  } catch (e) {
    console.error('[marketplace] could not expire replaced checkout session', (e as Error)?.message?.slice(0, 160))
    return false
  }
}

/** Refund through the gateway. `refundRef` is unique per refund (idempotency on both gateways). */
export async function gatewayRefund(order: OrderDoc, amount: number, refundRef: string): Promise<{ ok: boolean; ref: string }> {
  if (amount <= 0) return { ok: true, ref: 'zero' }
  if (order.payment.gateway === 'phonepe') {
    const txn = `MKR${refundRef.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 35)
    const r = await refundPhonePePayment({
      merchantTransactionId: txn,
      originalTransactionId: order.payment.ref || '',
      amount,
      userId: order.buyer_id,
      callbackUrl: `${getAppOrigin()}/api/marketplace/webhooks/phonepe`,
    })
    return { ok: r.ok, ref: txn }
  }
  if (order.payment.gateway === 'razorpay') {
    return refundRazorpayPayment(order.payment.intent || '', amount, `mkr-${refundRef}`, { mkt_order_id: order.id, refund_ref: refundRef.slice(0, 200) })
  }
  const stripe = await getStripeClient()
  const intent = order.payment.intent
  if (!intent) throw new Error('No Stripe payment to refund')
  const r = await stripe.refunds.create({ payment_intent: intent, amount, metadata: { mkt_order_id: order.id, refund_ref: refundRef } }, { idempotencyKey: `mkt-refund-${refundRef}` })
  return { ok: r.status === 'succeeded' || r.status === 'pending', ref: r.id }
}
