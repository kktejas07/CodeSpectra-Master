import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  syncCheckoutSessionCompleted,
  syncCheckoutSessionFailed,
  syncSubscriptionFromStripe,
  syncInvoiceFromStripe,
} from '@/lib/stripe-webhook-sync'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * POST /api/billing/stripe-webhook
 *
 * Receives Stripe webhook events, verifies the `stripe-signature` header
 * against STRIPE_WEBHOOK_SECRET on the raw body (stripe.webhooks.constructEvent,
 * which also rejects stale timestamps), and syncs to the billing_orders /
 * billing_payments / billing_subscriptions collections. Paid checkouts
 * activate via activatePaidOrder() — see lib/stripe-webhook-sync.ts.
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
  if (!signature) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    const stripe = new Stripe(stripeSecretKey)
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret)
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        await syncCheckoutSessionCompleted(session)
        break
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        await syncCheckoutSessionFailed(session)
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
