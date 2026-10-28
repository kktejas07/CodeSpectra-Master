/**
 * Certification attempt payments over the existing gateways (same rules as the
 * marketplace, lib/marketplace/gateways.ts): INR → PhonePe, else Razorpay, else
 * Stripe; USD → Stripe. References never collide with plan billing or
 * marketplace orders:
 *   PhonePe  merchantTransactionId "PCE" + order id hex (callback + return under /api/pro-certs/webhooks/phonepe)
 *   Razorpay Payment Link with reference_id "PCE" + order id hex (CORE-039); payment.ref = plink id;
 *            callback → /api/pro-certs/orders/<id>/return, webhook payment_link.* on /api/billing/webhook
 *   Stripe   Checkout Session with metadata.pce_order_id; settled from the
 *            success return and /api/pro-certs/webhooks/stripe. The shared
 *            plan-billing webhook ignores these sessions (no billing order).
 * Paid state is always read back from the gateway — never from the browser.
 */
import 'server-only'
import type Stripe from 'stripe'
import { getAppOrigin } from '@/lib/app-origin'
import { createPhonePePayment, getPhonePeTransactionStatus, isPhonePeConfiguredAsync, refundPhonePePayment } from '@/lib/phonepe-server'
import { getStripeClient, getStripeSecretKey } from '@/lib/stripe-client'
import { cancelPaymentLink, createPaymentLink, fetchPaymentLinkState, isRazorpayConfigured, refundRazorpayPayment } from '@/lib/razorpay-links'
import type { CertCurrency, CertOrderDoc } from './types'

export const phonePeTxnFor = (orderId: string) => `PCE${orderId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 35)
export const isCertTxn = (txn: string) => /^PCE[A-Za-z0-9]{1,32}$/.test(txn)

export async function pickGateway(currency: CertCurrency): Promise<'phonepe' | 'razorpay' | 'stripe' | null> {
  if (currency === 'INR' && (await isPhonePeConfiguredAsync())) return 'phonepe'
  if (currency === 'INR' && (await isRazorpayConfigured())) return 'razorpay'
  if (await getStripeSecretKey()) return 'stripe'
  return null
}

export async function startPayment(order: CertOrderDoc, programTitle: string): Promise<{ redirect_url: string; ref: string }> {
  const origin = getAppOrigin()
  if (order.gateway === 'phonepe') {
    const txn = phonePeTxnFor(order.id)
    const { payUrl } = await createPhonePePayment({
      merchantTransactionId: txn,
      amount: order.amount,
      userId: order.user_id,
      redirectUrl: `${origin}/api/pro-certs/webhooks/phonepe/return?txn=${txn}`,
      callbackUrl: `${origin}/api/pro-certs/webhooks/phonepe`,
    })
    return { redirect_url: payUrl, ref: txn }
  }
  if (order.gateway === 'razorpay') {
    const link = await createPaymentLink({
      amount: order.amount,
      currency: order.currency,
      referenceId: phonePeTxnFor(order.id),
      description: `${programTitle} — certification attempt`,
      email: order.user_email,
      callbackUrl: `${origin}/api/pro-certs/orders/${order.id}/return`,
      expireBy: Math.floor((Date.now() + 31 * 60_000) / 1000),
      notes: { pce_order_id: order.id, kind: 'pro_cert' },
    })
    return { redirect_url: link.url, ref: link.id }
  }
  const stripe = await getStripeClient()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: order.user_email || undefined,
    client_reference_id: `pce_${order.id}`,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: order.amount,
        product_data: { name: `${programTitle} — certification attempt`.slice(0, 200) },
      },
    }],
    metadata: { pce_order_id: order.id, kind: 'pro_cert' },
    payment_intent_data: { metadata: { pce_order_id: order.id, kind: 'pro_cert' } },
    expires_at: Math.floor((Date.now() + 31 * 60_000) / 1000),
    success_url: `${origin}/api/pro-certs/orders/${order.id}/return`,
    cancel_url: `${origin}/dashboard/certifications/proctored/${encodeURIComponent(order.program_slug)}?payment=canceled`,
  }, { idempotencyKey: `pce-checkout-${order.id}` })
  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return { redirect_url: session.url, ref: session.id }
}

export function certOrderIdFromSession(session: Pick<Stripe.Checkout.Session, 'metadata' | 'client_reference_id'>): string | null {
  const id = session.metadata?.pce_order_id || (session.client_reference_id?.startsWith('pce_') ? session.client_reference_id.slice(4) : '')
  return id && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

export type GatewayState = { state: 'paid'; amount: number; currency: string; txn: string; intent: string | null } | { state: 'failed' | 'pending' | 'unknown' }

export async function fetchGatewayState(order: CertOrderDoc): Promise<GatewayState> {
  const ref = order.payment.ref
  if (!ref) return { state: 'unknown' }
  if (order.gateway === 'phonepe') {
    const st = await getPhonePeTransactionStatus(ref)
    const d = st.data
    if (d?.merchantTransactionId !== ref) return { state: 'unknown' }
    if (st.success && d.state === 'COMPLETED' && st.code === 'PAYMENT_SUCCESS') return { state: 'paid', amount: Number(d.amount ?? 0), currency: 'INR', txn: String(d.transactionId || ref), intent: null }
    if (d.state === 'FAILED') return { state: 'failed' }
    return { state: 'pending' }
  }
  if (order.gateway === 'razorpay') return fetchPaymentLinkState(ref, phonePeTxnFor(order.id))
  if (order.gateway !== 'stripe') return { state: 'unknown' }
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
 * CORE-040: close the payment page of an order replaced by a newer checkout.
 * Stripe sessions are expired, Razorpay links cancelled; PhonePe has no cancel
 * API (a late payment there is refunded at settlement). Best effort.
 */
export async function closePaymentPage(order: Pick<CertOrderDoc, 'gateway' | 'payment'>): Promise<boolean> {
  const ref = order.payment.ref
  if (!ref) return false
  try {
    if (order.gateway === 'stripe' && ref.startsWith('cs_')) {
      await (await getStripeClient()).checkout.sessions.expire(ref)
      return true
    }
    if (order.gateway === 'razorpay') return await cancelPaymentLink(ref)
  } catch (e) {
    console.error('[pro-certs] could not close replaced payment page', (e as Error)?.message?.slice(0, 160))
  }
  return false
}

/** CORE-040: full refund of a paid order that can't become an attempt (duplicate payment). */
export async function refundOrder(order: CertOrderDoc): Promise<{ ok: boolean; ref: string }> {
  const amount = order.payment.paid_amount ?? order.amount
  if (amount <= 0) return { ok: true, ref: 'zero' }
  const refundRef = `pcr-${order.id}`
  if (order.gateway === 'phonepe') {
    const txn = `PCR${order.id.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 35)
    const r = await refundPhonePePayment({
      merchantTransactionId: txn,
      originalTransactionId: order.payment.ref || '',
      amount,
      userId: order.user_id,
      callbackUrl: `${getAppOrigin()}/api/pro-certs/webhooks/phonepe`,
    })
    return { ok: r.ok, ref: txn }
  }
  if (order.gateway === 'razorpay') return refundRazorpayPayment(order.payment.intent || '', amount, refundRef, { pce_order_id: order.id, reason: 'duplicate_payment' })
  if (order.gateway === 'stripe') {
    if (!order.payment.intent) throw new Error('No Stripe payment to refund')
    const r = await (await getStripeClient()).refunds.create({ payment_intent: order.payment.intent, amount, metadata: { pce_order_id: order.id, reason: 'duplicate_payment' } }, { idempotencyKey: refundRef })
    return { ok: r.status === 'succeeded' || r.status === 'pending', ref: r.id }
  }
  return { ok: false, ref: refundRef }
}
