import type { BillingInterval, BillingPlanId } from '@/lib/billing-catalog'
import { getServerSecretsFromCache, warmServerSecretsCache } from '@/lib/server-secrets-cache'

function pickSecret(
  dbField: 'stripe_secret_key' | 'stripe_webhook_secret',
  envVal: string | undefined
): string {
  const env = (envVal ?? '').trim()
  if (env) return env
  const s = getServerSecretsFromCache()
  return String(s[dbField] ?? '').trim()
}

function pickPrice(envVal: string | undefined, dbVal: string | undefined): string {
  const env = (envVal ?? '').trim()
  if (env) return env
  return String(dbVal ?? '').trim()
}

export function getStripeSecretKey(): string {
  return pickSecret('stripe_secret_key', process.env.STRIPE_SECRET_KEY)
}

export function getStripeWebhookSecret(): string {
  return pickSecret('stripe_webhook_secret', process.env.STRIPE_WEBHOOK_SECRET)
}

/** True when Checkout can use Stripe (secret + price for plan/interval). Call after `await warmServerSecretsCache()`. */
export async function stripeCheckoutConfigured(
  planId: BillingPlanId,
  interval: BillingInterval
): Promise<boolean> {
  await warmServerSecretsCache()
  if (!getStripeSecretKey()) return false
  return Boolean(getStripePriceId(planId, interval))
}

export function getStripePriceId(planId: BillingPlanId, interval: BillingInterval): string | null {
  if (planId === 'free') return null
  const s = getServerSecretsFromCache()
  const isEnt = planId === 'enterprise'
  const month = isEnt
    ? pickPrice(process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY, s.stripe_price_enterprise_monthly)
    : pickPrice(process.env.STRIPE_PRICE_PRO_MONTHLY, s.stripe_price_pro_monthly)
  const year = isEnt
    ? pickPrice(process.env.STRIPE_PRICE_ENTERPRISE_YEARLY, s.stripe_price_enterprise_yearly)
    : pickPrice(process.env.STRIPE_PRICE_PRO_YEARLY, s.stripe_price_pro_yearly)
  const id = interval === 'year' ? year : month
  return id && id.trim() !== '' ? id.trim() : null
}
