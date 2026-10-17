import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  syncCheckoutSessionCompleted,
  syncSubscriptionFromStripe,
  syncInvoiceFromStripe,
} from '@/lib/stripe-webhook-sync'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * POST /api/billing/stripe-webhook
 *
 * Receives Stripe webhook events, verifies the signature, and syncs to
 * the billing_orders / billing_payments / billing_subscriptions collections.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.' },
      { status: 503 },
    )
  }

  const raw = await req.text()
  const signature = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event
  try {
    const stripe = new Stripe(stripeSecretKey)
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret)
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed:', e)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await syncCheckoutSessionCompleted(session)
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await syncSubscriptionFromStripe(subscription)
        break
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await syncInvoiceFromStripe(invoice)
        break
      }
      default:
        logger.webhook('[stripe-webhook] unhandled event:', { type: event.type })
    }

    return NextResponse.json({ received: true })
  } catch (e) {
    console.error('[stripe-webhook] processing error:', e)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
