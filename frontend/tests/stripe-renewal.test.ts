import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const h = vi.hoisted(() => ({
  db: null as unknown as import('./helpers/fake-mongo').FakeDb,
  stripeSub: null as any,
  stripe: {
    subscriptions: {
      retrieve: vi.fn(async () => JSON.parse(JSON.stringify(h.stripeSub))),
      update: vi.fn(async () => ({})),
      cancel: vi.fn(async () => ({})),
    },
  },
  notify: vi.fn(async () => null),
}))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db }))
vi.mock('@/lib/stripe-client', () => ({
  getStripeClient: async () => h.stripe,
  getStripeSecretKey: async () => 'sk_test',
  getStripeWebhookSecret: async () => 'whsec_test',
  stripeAutoRenewEnabled: () => true,
}))
vi.mock('@/lib/notifications', () => ({ notify: h.notify }))
vi.mock('@/lib/server-currency', () => ({ getPlatformCurrency: async () => 'USD' }))
vi.mock('@/lib/logger', () => ({ logger: { webhook: () => {} } }))
vi.mock('@/lib/automation/events', () => ({ emit: async () => undefined }))

import { syncInvoicePaid, syncInvoicePaymentFailed, syncSubscriptionFromStripe } from '@/lib/stripe-webhook-sync'
import { cancelAtPeriodEnd, endLapsedGracePeriods, resumeSubscription } from '@/lib/billing-plans'
import { hasAccess } from '@/lib/billing-lifecycle'
import { pickEffectivePlanKey } from '@/lib/entitlements-core'

h.db = new FakeDb()
const db = h.db
const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T00:00:00.000Z')
const T1 = T0 + 30 * DAY
const T2 = T1 + 31 * DAY
const sec = (ms: number) => Math.floor(ms / 1000)
const iso = (ms: number) => new Date(ms).toISOString()

const subs = () => db.collection('billing_subscriptions')
const orders = () => db.collection('billing_orders')
const payments = () => db.collection('billing_payments')

function stripeSubscription(start: number, end: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { order_id: 'ord_1', user_id: 'u1', plan_id: 'pro', interval: 'month' },
    items: { data: [{ current_period_start: sec(start), current_period_end: sec(end) }] },
    ...extra,
  }
}

function invoice(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    status: 'paid',
    amount_paid: 2900,
    currency: 'usd',
    customer: 'cus_1',
    billing_reason: 'subscription_create',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata: {} } },
    ...extra,
  } as any
}

beforeEach(async () => {
  db.cols.forEach((c) => (c.docs = []))
  vi.clearAllMocks()
  vi.useRealTimers()
  h.stripeSub = stripeSubscription(T0, T1)
  // The order Checkout stored (server-priced) before redirecting to Stripe.
  await orders().insertOne({
    id: 'ord_1', user_id: 'u1', amount_paise: 2900, currency: 'USD', plan_id: 'pro', plan_name: 'Pro',
    plan_kind: 'subscription', interval: 'month', duration_days: 30, receipt: 'r', status: 'created',
    notes: { provider: 'stripe', stripe_mode: 'subscription' }, created_at: iso(T0), updated_at: iso(T0),
  })
})

async function activateFirst() {
  await syncInvoicePaid(invoice('in_1'))
  return (await subs().findOne({ user_id: 'u1' }))!
}

describe('Stripe renewal: invoice.paid', () => {
  it('first invoice activates the checkout order with Stripe\'s period and ids', async () => {
    const sub = await activateFirst()
    expect(sub.status).toBe('active')
    expect(sub.plan_id).toBe('pro')
    expect(sub.ends_at).toBe(iso(T1))
    expect(sub.billing_mode).toBe('stripe_subscription')
    expect(sub.stripe_subscription_id).toBe('sub_1')
    expect(sub.stripe_customer_id).toBe('cus_1')
    const order = await orders().findOne({ id: 'ord_1' })
    expect(order.status).toBe('paid')
    expect(order.stripe_invoice_id).toBe('in_1')
    expect(await payments().countDocuments()).toBe(1)
  })

  it('a renewal invoice extends the period through a new order', async () => {
    await activateFirst()
    h.stripeSub = stripeSubscription(T1, T2)
    await syncInvoicePaid(invoice('in_2', { billing_reason: 'subscription_cycle' }))
    const sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.ends_at).toBe(iso(T2))
    expect(sub.last_order_id).not.toBe('ord_1')
    const renewal = await orders().findOne({ stripe_invoice_id: 'in_2' })
    expect(renewal).toMatchObject({ status: 'paid', plan_id: 'pro', amount_paise: 2900, user_id: 'u1' })
    expect(await payments().countDocuments()).toBe(2)
    expect(await subs().countDocuments()).toBe(1)
  })

  it('is idempotent per invoice id (replays and concurrent deliveries)', async () => {
    await activateFirst()
    await syncInvoicePaid(invoice('in_1'))
    h.stripeSub = stripeSubscription(T1, T2)
    await Promise.all([
      syncInvoicePaid(invoice('in_2', { billing_reason: 'subscription_cycle' })),
      syncInvoicePaid(invoice('in_2', { billing_reason: 'subscription_cycle' })),
    ])
    await syncInvoicePaid(invoice('in_2', { billing_reason: 'subscription_cycle' }))
    expect(await orders().countDocuments()).toBe(2)
    expect(await payments().countDocuments()).toBe(2)
    expect((await subs().findOne({ user_id: 'u1' })).ends_at).toBe(iso(T2))
    expect(h.notify.mock.calls.filter((c: any[]) => c[0].type === 'billing.payment_success')).toHaveLength(2)
  })

  it('does not activate when the first invoice paid less than the order', async () => {
    await syncInvoicePaid(invoice('in_1', { amount_paid: 100 }))
    expect(await subs().countDocuments()).toBe(0)
    expect((await orders().findOne({ id: 'ord_1' })).status).toBe('created')
  })

  it('ignores invoices for subscriptions without our metadata', async () => {
    h.stripeSub = { ...stripeSubscription(T0, T1), metadata: {} }
    await syncInvoicePaid(invoice('in_x'))
    expect(await subs().countDocuments()).toBe(0)
    expect(await orders().countDocuments()).toBe(1)
  })
})

describe('Stripe renewal: failure → grace → downgrade', () => {
  it('marks past due, keeps access for the grace window, notifies once', async () => {
    await activateFirst()
    const failedAt = new Date(T1 + 60_000)
    await syncInvoicePaymentFailed(invoice('in_2', { status: 'open', amount_paid: 0, billing_reason: 'subscription_cycle' }), failedAt)
    let sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.past_due).toBe(true)
    expect(sub.status).toBe('active')
    expect(sub.grace_ends_at).toBe(iso(failedAt.getTime() + 7 * DAY))
    expect(sub.ends_at).toBe(sub.grace_ends_at)
    expect(hasAccess(sub, new Date(T1 + 3 * DAY))).toBe(true)

    // Stripe retries: no second notice, grace not pushed out.
    await syncInvoicePaymentFailed(invoice('in_2', { status: 'open' }), new Date(T1 + 3 * DAY))
    sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.grace_ends_at).toBe(iso(failedAt.getTime() + 7 * DAY))
    // The dunning automation (on by default) owns the "Payment failed" notice — the webhook adds none (AUTO-034).
    expect(h.notify.mock.calls.filter((c: any[]) => c[0].type === 'billing.payment_failed')).toHaveLength(0)

    // After the grace window the user is on Free…
    const after = new Date(failedAt.getTime() + 8 * DAY)
    expect(hasAccess(sub, after)).toBe(false)
    expect(pickEffectivePlanKey({ subscription: sub, now: after }).key).toBe('free')

    // …and the sweep ends it here and at Stripe.
    expect(await endLapsedGracePeriods(after)).toBe(1)
    sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.status).toBe('expired')
    expect(sub.ended_reason).toBe('payment_failed')
    expect(h.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1')
    expect(await endLapsedGracePeriods(after)).toBe(0)
  })

  it('a paid retry during grace clears past due and extends the period', async () => {
    await activateFirst()
    await syncInvoicePaymentFailed(invoice('in_2', { status: 'open' }), new Date(T1 + 60_000))
    h.stripeSub = stripeSubscription(T1, T2)
    await syncInvoicePaid(invoice('in_2', { billing_reason: 'subscription_cycle' }))
    const sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.past_due).toBeUndefined()
    expect(sub.grace_ends_at).toBeUndefined()
    expect(sub.ends_at).toBe(iso(T2))
  })

  it('Stripe ending a past-due subscription downgrades immediately', async () => {
    await activateFirst()
    await syncInvoicePaymentFailed(invoice('in_2', { status: 'open' }), new Date(T1 + 60_000))
    const endedAt = T1 + 2 * DAY
    await syncSubscriptionFromStripe({ ...stripeSubscription(T1, T2), status: 'canceled', ended_at: sec(endedAt) } as any, true, new Date(endedAt))
    const sub = await subs().findOne({ user_id: 'u1' })
    expect(sub.status).toBe('expired')
    expect(Date.parse(sub.ends_at)).toBe(sec(endedAt) * 1000)
  })
})

describe('Stripe renewal: cancel / keep my plan', () => {
  it('cancel and resume go to Stripe for Stripe subscriptions', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(T0 + DAY))
    await activateFirst()
    const res = await cancelAtPeriodEnd('u1')
    expect(res?.ends_at).toBe(iso(T1))
    expect(h.stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true })
    expect((await subs().findOne({ user_id: 'u1' })).cancel_at_period_end).toBe(true)
    expect(await resumeSubscription('u1')).toBe(true)
    expect(h.stripe.subscriptions.update).toHaveBeenLastCalledWith('sub_1', { cancel_at_period_end: false })
    expect((await subs().findOne({ user_id: 'u1' })).cancel_at_period_end).toBe(false)
  })

  it('a Stripe failure leaves the plan unchanged', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(T0 + DAY))
    await activateFirst()
    h.stripe.subscriptions.update.mockRejectedValueOnce(new Error('stripe down'))
    await expect(cancelAtPeriodEnd('u1')).rejects.toThrow('stripe down')
    expect((await subs().findOne({ user_id: 'u1' })).cancel_at_period_end).toBe(false)
  })

  it('mirrors cancel_at_period_end set in the Stripe portal; ignores other subscriptions', async () => {
    await activateFirst()
    await syncSubscriptionFromStripe({ ...stripeSubscription(T0, T1), cancel_at_period_end: true } as any)
    expect((await subs().findOne({ user_id: 'u1' })).cancel_at_period_end).toBe(true)
    await syncSubscriptionFromStripe({ ...stripeSubscription(T0, T1), id: 'sub_other', status: 'canceled' } as any, true)
    expect((await subs().findOne({ user_id: 'u1' })).status).toBe('active')
  })
})
