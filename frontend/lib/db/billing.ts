/**
 * Billing repositories: orders, payments, subscriptions.
 *
 * Collections:
 *   - billing_orders   : { id, user_id, razorpay_order_id, amount_paise, currency,
 *                          plan_id, receipt, status, created_at, updated_at }
 *   - billing_payments : { id, user_id, order_id, razorpay_payment_id, signature,
 *                          status:'captured'|'failed'|'refunded', amount_paise, created_at }
 *   - billing_subscriptions : { id, user_id, plan_id, status, started_at, ends_at }
 */
import { randomUUID } from 'crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'

export const newId = (): string => randomUUID()
export const nowIso = (): string => new Date().toISOString()

export interface BillingOrderDoc {
  id: string
  user_id: string
  razorpay_order_id: string
  amount_paise: number
  currency: string
  plan_id: string
  receipt: string
  status: 'created' | 'attempted' | 'paid' | 'failed' | 'refunded'
  notes?: Record<string, string>
  created_at: string
  updated_at: string
}
export interface BillingPaymentDoc {
  id: string
  user_id: string
  order_id: string
  razorpay_payment_id: string
  signature?: string
  status: 'captured' | 'failed' | 'refunded' | 'authorized'
  amount_paise: number
  method?: string
  created_at: string
  raw_event?: Record<string, unknown>
}
export interface BillingSubscriptionDoc {
  id: string
  user_id: string
  plan_id: string
  status: 'active' | 'cancelled' | 'expired' | 'past_due'
  started_at: string
  ends_at: string
  last_payment_id?: string
  created_at: string
}

export async function billingOrders(): Promise<Collection<BillingOrderDoc>> {
  return (await getMongoDb()).collection<BillingOrderDoc>('billing_orders')
}
export async function billingPayments(): Promise<Collection<BillingPaymentDoc>> {
  return (await getMongoDb()).collection<BillingPaymentDoc>('billing_payments')
}
export async function billingSubscriptions(): Promise<Collection<BillingSubscriptionDoc>> {
  return (await getMongoDb()).collection<BillingSubscriptionDoc>('billing_subscriptions')
}

/** Catalog of buyable plans. Amounts in paise. */
export const BILLING_PLANS: Record<
  string,
  { id: string; name: string; amount_paise: number; currency: 'INR'; kind: 'one_time' | 'subscription'; duration_days?: number; perks: string[] }
> = {
  pro_monthly: {
    id: 'pro_monthly',
    name: 'CodeSpectra Pro · Monthly',
    amount_paise: 49900, // ₹499
    currency: 'INR',
    kind: 'subscription',
    duration_days: 30,
    perks: [
      'Unlimited AI code reviews',
      'Unlimited Smart Hints',
      'Daily premium problems',
      'Advanced Skill Analytics',
      'Identity verification for hiring',
    ],
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'CodeSpectra Pro · Yearly',
    amount_paise: 499000, // ₹4990
    currency: 'INR',
    kind: 'subscription',
    duration_days: 365,
    perks: ['Everything in Monthly', '2 months free', 'Priority AI model access'],
  },
  problem_pack_50: {
    id: 'problem_pack_50',
    name: '50 Premium Problem Pack',
    amount_paise: 19900, // ₹199
    currency: 'INR',
    kind: 'one_time',
    perks: ['50 expert-curated premium problems', 'Lifetime access'],
  },
}
