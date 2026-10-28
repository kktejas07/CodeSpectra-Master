/**
 * Stripe client + credentials. Admin-saved keys (server secrets) win over env
 * (D17). Kept in its own module so billing code and tests can swap the client.
 */
import Stripe from 'stripe'
import { readServerSecrets } from '@/lib/server-secrets-cache'

type StripeSecrets = { stripe_secret_key?: string; stripe_webhook_secret?: string }

async function secrets(): Promise<StripeSecrets> {
  return readServerSecrets().catch(() => ({} as StripeSecrets))
}

export async function getStripeSecretKey(): Promise<string | null> {
  const s = await secrets()
  return s.stripe_secret_key || process.env.STRIPE_SECRET_KEY || null
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const s = await secrets()
  return s.stripe_webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || null
}

export async function getStripeClient(): Promise<Stripe> {
  const key = await getStripeSecretKey()
  if (!key) throw new Error('No payment provider configured: Stripe key missing')
  return new Stripe(key)
}

/**
 * Recurring Stripe billing for monthly / annual plans. On by default; set
 * STRIPE_AUTO_RENEW=false to fall back to one-off payments that extend the plan.
 */
export function stripeAutoRenewEnabled(): boolean {
  return (process.env.STRIPE_AUTO_RENEW ?? 'true').toLowerCase() !== 'false'
}
