/**
 * Optional dedicated Stripe endpoint for marketplace sessions. Marketplace sessions are ALSO
 * routed from the shared /api/billing/stripe-webhook, so configure this one only if you want a
 * separate endpoint (secret: server secret `stripe_marketplace_webhook_secret` /
 * env STRIPE_MARKETPLACE_WEBHOOK_SECRET, else the main Stripe webhook secret).
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeSecretKey, getStripeWebhookSecret } from '@/lib/stripe-client'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { marketplaceOrderIdFromSession } from '@/lib/marketplace/gateways'
import { handleStripeSessionEvent } from '@/lib/marketplace/settle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secrets = (await readServerSecrets().catch(() => ({}))) as Record<string, string | undefined>
  const [key, mainSecret] = await Promise.all([getStripeSecretKey(), getStripeWebhookSecret()])
  const secret = secrets.stripe_marketplace_webhook_secret || process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET || mainSecret
  if (!key || !secret) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 })
  const raw = await req.text()
  let event: Stripe.Event
  try {
    event = new Stripe(key).webhooks.constructEvent(raw, req.headers.get('stripe-signature') || '', secret)
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }
  if (!event.type.startsWith('checkout.session.')) return NextResponse.json({ received: true })
  const session = event.data.object as Stripe.Checkout.Session
  const orderId = marketplaceOrderIdFromSession(session)
  if (!orderId) return NextResponse.json({ received: true, ignored: true })
  try {
    await handleStripeSessionEvent(event.type, session, orderId)
    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[marketplace stripe] processing error:', (e as Error)?.message)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
