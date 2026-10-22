/**
 * Stripe webhook for certification attempts (checkout.session.*). Secret:
 * server secret `stripe_pro_cert_webhook_secret` / env
 * STRIPE_PRO_CERT_WEBHOOK_SECRET, else the main Stripe webhook secret. The
 * session is only used to find our order; the paid state is re-read from Stripe.
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeSecretKey, getStripeWebhookSecret } from '@/lib/stripe-client'
import { readServerSecrets } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secrets = (await readServerSecrets().catch(() => ({}))) as Record<string, string | undefined>
  const [key, mainSecret] = await Promise.all([getStripeSecretKey(), getStripeWebhookSecret()])
  const secret = secrets.stripe_pro_cert_webhook_secret || process.env.STRIPE_PRO_CERT_WEBHOOK_SECRET || mainSecret
  if (!key || !secret) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = new Stripe(key).webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', secret)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }
  if (!event.type.startsWith('checkout.session.')) return NextResponse.json({ received: true })
  const { certOrderIdFromSession } = await import('@/lib/pro-certs/payments')
  const orderId = certOrderIdFromSession(event.data.object as Stripe.Checkout.Session)
  if (!orderId) return NextResponse.json({ received: true, ignored: true })
  try {
    const { settleOrder } = await import('@/lib/pro-certs/service')
    await settleOrder(orderId)
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[pro-certs stripe] processing error:', (e as Error)?.message)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
