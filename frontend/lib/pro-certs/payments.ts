/**
 * Certification attempt payments over the existing gateways (same rules as the
 * marketplace, lib/marketplace/gateways.ts): PhonePe for INR when configured,
 * else Stripe (INR or USD). References never collide with plan billing or
 * marketplace orders:
 *   PhonePe  merchantTransactionId "PCE" + order id hex (callback + return under /api/pro-certs/webhooks/phonepe)
 *   Stripe   Checkout Session with metadata.pce_order_id; settled from the
 *            success return and /api/pro-certs/webhooks/stripe. The shared
 *            plan-billing webhook ignores these sessions (no billing order).
 * Paid state is always read back from the gateway — never from the browser.
 */
import 'server-only'
import type Stripe from 'stripe'
import { getAppOrigin } from '@/lib/app-origin'
import { createPhonePePayment, getPhonePeTransactionStatus, isPhonePeConfiguredAsync } from '@/lib/phonepe-server'
import { getStripeClient, getStripeSecretKey } from '@/lib/stripe-client'
import type { CertCurrency, CertOrderDoc } from './types'

export const phonePeTxnFor = (orderId: string) => `PCE${orderId.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 35)
export const isCertTxn = (txn: string) => /^PCE[A-Za-z0-9]{1,32}$/.test(txn)

export async function pickGateway(currency: CertCurrency): Promise<'phonepe' | 'stripe' | null> {
  if (currency === 'INR' && (await isPhonePeConfiguredAsync())) return 'phonepe'
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
