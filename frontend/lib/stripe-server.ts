/**
 * Phase 7 stub — Stripe-server helpers pending re-implementation.
 * Original used Supabase `user_subscriptions` row for the customer id;
 * future implementation will read that from MongoDB `user_subscriptions`.
 */
import Stripe from 'stripe'
import type { BillingInterval, BillingPlanId } from '@/lib/billing-catalog'
import { getStripeSecretKey } from '@/lib/stripe-env'

export async function getStripe(): Promise<Stripe | null> {
  const key = getStripeSecretKey()
  if (!key) return null
  return new Stripe(key, { typescript: true })
}

const DEAD = 'Stripe helpers pending MongoDB re-implementation.'

export async function createStripeCheckoutSession(_params: {
  userId: string
  userEmail: string
  planId: BillingPlanId
  interval: BillingInterval
  baseUrl: string
}): Promise<{ url: string }> {
  throw new Error(DEAD)
}

export async function cancelStripeSubscription(_id: string): Promise<void> {
  throw new Error(DEAD)
}

export async function updateStripeSubscriptionInterval(_params: {
  stripeSubscriptionId: string
  newInterval: BillingInterval
  planId: BillingPlanId
}): Promise<void> {
  throw new Error(DEAD)
}
