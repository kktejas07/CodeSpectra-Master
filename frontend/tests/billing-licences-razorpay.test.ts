/**
 * Licence seats (atomic counting, CSV + domain assignment) and Razorpay
 * subscription webhooks (idempotent per charge, state changes) against the
 * in-memory Mongo double.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { FakeDb } from './helpers/fake-mongo'

const db = vi.hoisted(() => ({ current: null as unknown as import('./helpers/fake-mongo').FakeDb }))
const activate = vi.hoisted(() => vi.fn(async () => ({ subscription: null })))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => db.current }))
vi.mock('@/lib/automation/events', () => ({ emit: vi.fn(async () => null) }))
vi.mock('@/lib/notifications', () => ({ notify: vi.fn(async () => null) }))
vi.mock('@/lib/billing-plans', () => ({
  activatePaidOrder: activate,
  ensureBillingIndexes: vi.fn(async () => {}),
  orderPlanSnapshot: (p: { id: string; name: string; kind: string; duration_days?: number; interval?: string }) => ({ plan_id: p.id, plan_name: p.name, plan_kind: p.kind, duration_days: p.duration_days, interval: p.interval }),
}))

const DAY = 86_400_000
const future = (d: number) => new Date(Date.now() + d * DAY).toISOString()

beforeAll(() => {
  db.current = new FakeDb()
})

describe('licence seats', () => {
  it('assigns by email within the seat count, skips holders, links accounts', async () => {
    await db.current.collection('tenants').insertOne({ id: 'org1', name: 'VNR College', kind: 'college' })
    await db.current.collection('user').insertOne({ id: 'u1', email: 'a@vnr.edu.in' })
    const { issueManualLicence, assignSeats, licenceSeatFor, getLicence, revokeSeat } = await import('@/lib/billing/licences')
    const lic = (await issueManualLicence({ orgId: 'org1', seats: 2, currency: 'INR', endsAt: future(30), actorId: 'admin' }))!
    expect(lic.status).toBe('active')

    const r = await assignSeats(lic.id, 'org1', ['a@vnr.edu.in', 'b@vnr.edu.in', 'c@vnr.edu.in'], 'admin')
    expect(r).toEqual({ assigned: ['a@vnr.edu.in', 'b@vnr.edu.in'], skipped: [], overLimit: ['c@vnr.edu.in'] })
    expect((await getLicence(lic.id))!.seats_used).toBe(2)

    const again = await assignSeats(lic.id, 'org1', ['a@vnr.edu.in'], 'admin')
    expect(again).toEqual({ assigned: [], skipped: ['a@vnr.edu.in'], overLimit: [] })

    // Another org can't touch it.
    expect(await assignSeats(lic.id, 'org2', ['x@y.com'], 'admin')).toBeNull()

    expect((await licenceSeatFor('u1', 'a@vnr.edu.in'))?.id).toBe(lic.id)
    expect(await licenceSeatFor('u9', 'zzz@other.com')).toBeNull()

    expect(await revokeSeat(lic.id, 'org1', 'b@vnr.edu.in')).toBe(true)
    expect(await revokeSeat(lic.id, 'org1', 'b@vnr.edu.in')).toBe(false)
    expect((await getLicence(lic.id))!.seats_used).toBe(1)
  })

  it('auto-assigns by email domain while seats last', async () => {
    await db.current.collection('tenants').insertOne({ id: 'org3', name: 'Acme', kind: 'company' })
    const { issueManualLicence, updateLicenceSettings, licenceSeatFor, getLicence } = await import('@/lib/billing/licences')
    const lic = (await issueManualLicence({ orgId: 'org3', seats: 1, currency: 'USD', endsAt: future(30), actorId: 'admin' }))!
    await updateLicenceSettings(lic.id, 'org3', { email_domains: ['@Acme.io', 'not a domain'], auto_assign: true })
    expect((await getLicence(lic.id))!.email_domains).toEqual(['acme.io'])

    expect((await licenceSeatFor('d1', 'dev@eng.acme.io'))?.id).toBe(lic.id)
    expect(await licenceSeatFor('d2', 'ops@acme.io')).toBeNull() // full
    expect(await licenceSeatFor('d3', 'x@notacme.io')).toBeNull()
    expect((await getLicence(lic.id))!.seats_used).toBe(1)
  })

  it('a paid licence order activates once and renews from the current end', async () => {
    await db.current.collection('tenants').insertOne({ id: 'org4', name: 'Org 4', kind: 'company' })
    const { prepareLicencePurchase, activateLicenceOrder, getLicence } = await import('@/lib/billing/licences')
    const prep = await prepareLicencePurchase({ orgId: 'org4', seats: 20, currency: 'INR', actorId: 'adm' })
    expect(prep.ok).toBe(true)
    if (!prep.ok) return
    expect(prep.amount).toBe(20 * 299900)
    expect(await prepareLicencePurchase({ orgId: 'org4', seats: 2, currency: 'INR', actorId: 'adm' })).toEqual({ ok: false, code: 'min_seats' })
    const order = { id: 'lo1', user_id: 'adm', org_id: 'org4', licence_id: prep.licence.id, licence_seats: 20, plan_kind: 'licence' } as never
    await activateLicenceOrder(order)
    await activateLicenceOrder(order) // replay
    const lic = (await getLicence(prep.licence.id))!
    expect(lic.status).toBe('active')
    expect(lic.order_ids).toEqual(['lo1'])
    const firstEnd = Date.parse(lic.ends_at!)
    await activateLicenceOrder({ ...(order as object), id: 'lo2' } as never)
    expect(Date.parse((await getLicence(prep.licence.id))!.ends_at!)).toBe(firstEnd + 365 * DAY)
    // An order for another org never activates it.
    await activateLicenceOrder({ ...(order as object), id: 'lo3', org_id: 'orgX' } as never)
    expect((await getLicence(prep.licence.id))!.order_ids).toEqual(['lo1', 'lo2'])
  })
})

describe('Razorpay subscription webhooks', () => {
  const sec = (ms: number) => Math.floor(ms / 1000)
  const subEntity = { id: 'sub_TEST1', status: 'active', current_start: sec(Date.now()), current_end: sec(Date.now() + 30 * DAY), notes: { user_id: 'ru1', plan_id: 'pro', order_id: 'ord1', interval: 'month' } }
  const charged = (payId: string, amount = 49900) => ({ subscription: { entity: subEntity }, payment: { entity: { id: payId, amount, currency: 'INR', method: 'upi', vpa: 'a@ok' } } })

  it('first charge claims the checkout order once; replays do nothing', async () => {
    await db.current.collection('billing_orders').insertOne({ id: 'ord1', user_id: 'ru1', amount_paise: 49900, currency: 'INR', plan_id: 'pro', plan_kind: 'subscription', interval: 'month', status: 'created', razorpay_subscription_id: 'sub_TEST1', created_at: new Date().toISOString() })
    const { syncRazorpaySubscriptionEvent } = await import('@/lib/billing/razorpay-subscriptions')
    activate.mockClear()
    await syncRazorpaySubscriptionEvent('subscription.charged', charged('pay_1'))
    await syncRazorpaySubscriptionEvent('subscription.charged', charged('pay_1'))
    expect(activate).toHaveBeenCalledTimes(1)
    const o = await db.current.collection('billing_orders').findOne({ id: 'ord1' })
    expect(o).toMatchObject({ status: 'paid', razorpay_charge_id: 'pay_1' })
    const calls = activate.mock.calls as unknown as unknown[][]
    expect(calls[0][3]).toMatchObject({ subscriptionId: 'sub_TEST1' })
  })

  it('a short first charge never activates', async () => {
    await db.current.collection('billing_orders').insertOne({ id: 'ord2', user_id: 'ru2', amount_paise: 49900, currency: 'INR', plan_id: 'pro', plan_kind: 'subscription', interval: 'month', status: 'created', razorpay_subscription_id: 'sub_TEST2', created_at: new Date().toISOString() })
    const { syncRazorpaySubscriptionEvent } = await import('@/lib/billing/razorpay-subscriptions')
    activate.mockClear()
    await syncRazorpaySubscriptionEvent('subscription.charged', { subscription: { entity: { ...subEntity, id: 'sub_TEST2', notes: { user_id: 'ru2', plan_id: 'pro', order_id: 'ord2' } } }, payment: { entity: { id: 'pay_short', amount: 100, currency: 'INR' } } })
    expect(activate).not.toHaveBeenCalled()
  })

  it('a renewal gets its own order per payment id', async () => {
    await db.current.collection('billing_subscriptions').insertOne({ id: 's1', user_id: 'ru1', plan_id: 'pro', status: 'active', started_at: new Date().toISOString(), ends_at: future(30), billing_mode: 'razorpay_subscription', razorpay_subscription_id: 'sub_TEST1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    const { syncRazorpaySubscriptionEvent } = await import('@/lib/billing/razorpay-subscriptions')
    activate.mockClear()
    await syncRazorpaySubscriptionEvent('subscription.charged', charged('pay_2'))
    await syncRazorpaySubscriptionEvent('subscription.charged', charged('pay_2'))
    expect(activate).toHaveBeenCalledTimes(1)
    expect(await db.current.collection('billing_orders').countDocuments({ razorpay_subscription_id: 'sub_TEST1' })).toBe(2)
  })

  it('pending → past due with grace (once); halted → expired; cancelled keeps access to period end', async () => {
    const { syncRazorpaySubscriptionEvent } = await import('@/lib/billing/razorpay-subscriptions')
    const subs = db.current.collection('billing_subscriptions')
    await syncRazorpaySubscriptionEvent('subscription.pending', { subscription: { entity: subEntity } })
    const pd = await subs.findOne({ id: 's1' })
    expect(pd).toMatchObject({ past_due: true })
    const graceEnd = pd!.grace_ends_at
    await syncRazorpaySubscriptionEvent('subscription.pending', { subscription: { entity: subEntity } })
    expect((await subs.findOne({ id: 's1' }))!.grace_ends_at).toBe(graceEnd)

    await syncRazorpaySubscriptionEvent('subscription.activated', { subscription: { entity: subEntity } })
    expect((await subs.findOne({ id: 's1' }))!.past_due).toBeUndefined()

    await syncRazorpaySubscriptionEvent('subscription.cancelled', { subscription: { entity: subEntity } })
    expect(await subs.findOne({ id: 's1' })).toMatchObject({ status: 'active', cancel_at_period_end: true })

    await syncRazorpaySubscriptionEvent('subscription.halted', { subscription: { entity: subEntity } })
    expect(await subs.findOne({ id: 's1' })).toMatchObject({ status: 'expired', ended_reason: 'payment_failed' })
  })
})
