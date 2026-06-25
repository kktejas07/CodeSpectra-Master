import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { warmServerSecretsCache } from '@/lib/server-secrets-cache'
import { getStripeSecretKey, getStripeWebhookSecret } from '@/lib/stripe-env'
import {
  syncCheckoutSessionCompleted,
  syncInvoiceFromStripe,
  syncSubscriptionFromStripe,
} from '@/lib/stripe-webhook-sync'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  await warmServerSecretsCache()
  const whSecret = getStripeWebhookSecret()
  const secretKey = getStripeSecretKey()
  if (!whSecret || !secretKey) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  const stripe = new Stripe(secretKey, { typescript: true })
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret)
  } catch (err) {
    console.error('[Stripe webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client unavailable' }, { status: 503 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await syncCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, supabase)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription, supabase)
        break
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await syncInvoiceFromStripe(event.data.object as Stripe.Invoice, supabase)
        break
      default:
        break
    }
  } catch (e) {
    console.error('[Stripe webhook] Handler error:', e)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
