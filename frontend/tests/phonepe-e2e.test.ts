/**
 * PhonePe PG v1 end to end against a mocked gateway (audit A-021):
 * checkout (create order + /pg/v1/pay) → S2S callback (/api/billing/phonepe-webhook,
 * X-VERIFY checked) → status API (/pg/v1/status, X-VERIFY checked) → activation,
 * plus the browser return route, failure, short payment, pending and replay.
 *
 * The fake gateway verifies every X-VERIFY header the client sends, so a
 * checksum regression fails here. This is NOT a substitute for one real
 * sandbox run (see docs/devops/05-Production-Checklist.md).
 */
import crypto from 'crypto'
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { FakeDb } from './helpers/fake-mongo'

const SALT = 'salt-key-test'
const MERCHANT = 'MERCHUAT'

const h = vi.hoisted(() => ({
  db: null as unknown as import('./helpers/fake-mongo').FakeDb,
  notify: vi.fn(async () => null),
  sendEmail: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db }))
vi.mock('@/lib/server-secrets-cache', () => ({
  readServerSecrets: async () => ({ phonepe_merchant_id: 'MERCHUAT', phonepe_salt_key: 'salt-key-test', phonepe_salt_index: '1' }),
}))
vi.mock('@/lib/notifications', () => ({ notify: h.notify }))
vi.mock('@/lib/send-email', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/app-origin', () => ({ getAppOrigin: () => 'https://app.test' }))

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

/** In-memory PhonePe: transactions by merchantTransactionId. */
type Txn = { amount: number; state: 'PENDING' | 'COMPLETED' | 'FAILED'; reportAmount?: number; userId: string }
const gateway = new Map<string, Txn>()
const gatewayErrors: string[] = []

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const headers = new Headers(init?.headers)
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  if (url.pathname.endsWith('/pg/v1/pay')) {
    const body64 = JSON.parse(String(init?.body)).request as string
    if (headers.get('x-verify') !== `${sha(body64 + '/pg/v1/pay' + SALT)}###1`) {
      gatewayErrors.push('pay: bad X-VERIFY')
      return json({ success: false, code: 'KEY_NOT_CONFIGURED' }, 400)
    }
    const req = JSON.parse(Buffer.from(body64, 'base64').toString('utf8'))
    if (req.merchantId !== MERCHANT || !/^[A-Za-z0-9_-]{1,35}$/.test(req.merchantTransactionId)) {
      gatewayErrors.push('pay: bad payload')
      return json({ success: false, code: 'BAD_REQUEST' }, 400)
    }
    gateway.set(req.merchantTransactionId, { amount: req.amount, state: 'PENDING', userId: req.merchantUserId })
    return json({
      success: true,
      code: 'PAYMENT_INITIATED',
      message: 'ok',
      data: { merchantId: MERCHANT, merchantTransactionId: req.merchantTransactionId, instrumentResponse: { type: 'PAY_PAGE', redirectInfo: { url: `https://mercury-uat.phonepe.com/pay/${req.merchantTransactionId}`, method: 'GET' } } },
    })
  }
  const m = /\/pg\/v1\/status\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (m) {
    const path = url.pathname.slice(url.pathname.indexOf('/pg/v1/'))
    if (headers.get('x-verify') !== `${sha(path + SALT)}###1` || headers.get('x-merchant-id') !== MERCHANT) {
      gatewayErrors.push('status: bad X-VERIFY')
      return json({ success: false, code: 'AUTHORIZATION_FAILED' }, 401)
    }
    const t = gateway.get(m[2])
    if (!t) return json({ success: false, code: 'TRANSACTION_NOT_FOUND' })
    const code = t.state === 'COMPLETED' ? 'PAYMENT_SUCCESS' : t.state === 'FAILED' ? 'PAYMENT_ERROR' : 'PAYMENT_PENDING'
    return json({
      success: t.state === 'COMPLETED',
      code,
      data: { merchantId: MERCHANT, merchantTransactionId: m[2], transactionId: `PPTXN_${m[2]}`, amount: t.reportAmount ?? t.amount, state: t.state, responseCode: 'SUCCESS' },
    })
  }
  return Promise.reject(new Error(`unexpected fetch ${url}`))
}

/** What PhonePe POSTs to the S2S callback URL. */
function callbackRequest(txn: string, opts: { tamper?: boolean } = {}) {
  const t = gateway.get(txn)!
  const payload = { success: t.state === 'COMPLETED', code: t.state === 'COMPLETED' ? 'PAYMENT_SUCCESS' : 'PAYMENT_ERROR', data: { merchantId: MERCHANT, merchantTransactionId: txn, amount: t.amount, state: t.state } }
  const response = Buffer.from(JSON.stringify(payload)).toString('base64')
  const xVerify = `${sha(response + (opts.tamper ? 'wrong-salt' : SALT))}###1`
  return new NextRequest('https://app.test/api/billing/phonepe-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-verify': xVerify },
    body: JSON.stringify({ response }),
  })
}

const PLAN = { id: 'pro', name: 'Pro', amount_paise: 49_900, currency: 'INR', kind: 'subscription', duration_days: 30, interval: 'month', perks: [], mode: 'checkout', source: 'static' } as const

async function checkout(userId: string): Promise<string> {
  const { PaymentService } = await import('@/lib/payment-service')
  const adapter = await new PaymentService().getAdapterForCheckout('INR', 'IN')
  expect(adapter.name).toBe('phonepe')
  const res = await adapter.createCheckout(userId, `${userId}@x.test`, 'pro', PLAN as never)
  expect(res.redirect_url).toMatch(/^https:\/\/mercury-uat\.phonepe\.com\/pay\//)
  return res.gateway_id as string
}

const realFetch = globalThis.fetch
beforeEach(() => {
  h.db = new FakeDb()
  gateway.clear()
  gatewayErrors.length = 0
  process.env.PHONEPE_ENABLED = 'true'
  globalThis.fetch = vi.fn(fakeFetch) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
  delete process.env.PHONEPE_ENABLED
})

describe('PhonePe end to end (mocked gateway)', () => {
  it('create → S2S callback → status → activation; replay is a no-op', async () => {
    const txn = await checkout('u1')
    const order = await h.db.collection('billing_orders').findOne({ phonepe_transaction_id: txn })
    expect(order).toMatchObject({ status: 'created', amount_paise: 49_900, currency: 'INR', user_id: 'u1' })
    expect(gateway.get(txn)?.amount).toBe(49_900)

    gateway.get(txn)!.state = 'COMPLETED'
    const { POST: webhook } = await import('@/app/api/billing/phonepe-webhook/route')
    const res = await webhook(callbackRequest(txn))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, status: 'success' })

    expect((await h.db.collection('billing_orders').findOne({ id: order.id })).status).toBe('paid')
    const pays = await h.db.collection('billing_payments').find({ order_id: order.id }).toArray()
    expect(pays).toHaveLength(1)
    expect(pays[0]).toMatchObject({ phonepe_payment_id: `PPTXN_${txn}`, amount_paise: 49_900, status: 'captured' })
    const sub = await h.db.collection('billing_subscriptions').findOne({ user_id: 'u1' })
    expect(sub).toMatchObject({ status: 'active', plan_id: 'pro' })
    const endsAt = sub.ends_at

    // Replayed callback + the browser return: no second payment, no extension.
    expect((await webhook(callbackRequest(txn))).status).toBe(200)
    const { GET: ret } = await import('@/app/api/billing/phonepe-callback/route')
    const r = await ret(new NextRequest(`https://app.test/api/billing/phonepe-callback?txn=${txn}`))
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('https://app.test/dashboard/billing?payment=phonepe&status=success')
    expect(await h.db.collection('billing_payments').countDocuments({ order_id: order.id })).toBe(1)
    expect((await h.db.collection('billing_subscriptions').findOne({ user_id: 'u1' })).ends_at).toBe(endsAt)
    expect(gatewayErrors).toEqual([])
  })

  it('rejects a callback with a bad X-VERIFY and changes nothing', async () => {
    const txn = await checkout('u2')
    gateway.get(txn)!.state = 'COMPLETED'
    const { POST: webhook } = await import('@/app/api/billing/phonepe-webhook/route')
    const res = await webhook(callbackRequest(txn, { tamper: true }))
    expect(res.status).toBe(400)
    expect((await h.db.collection('billing_orders').findOne({ phonepe_transaction_id: txn })).status).toBe('created')
    expect(await h.db.collection('billing_subscriptions').countDocuments({ user_id: 'u2' })).toBe(0)
  })

  it('never trusts the callback body: a "success" callback for an unpaid txn stays pending', async () => {
    const txn = await checkout('u3')
    // Callback claims COMPLETED but the status API (source of truth) says PENDING.
    gateway.get(txn)!.state = 'COMPLETED'
    const req = callbackRequest(txn)
    gateway.get(txn)!.state = 'PENDING'
    const { POST: webhook } = await import('@/app/api/billing/phonepe-webhook/route')
    expect(await (await webhook(req)).json()).toEqual({ success: true, status: 'pending' })
    expect((await h.db.collection('billing_orders').findOne({ phonepe_transaction_id: txn })).status).toBe('created')
  })

  it('failed payment marks the order failed without activating', async () => {
    const txn = await checkout('u4')
    gateway.get(txn)!.state = 'FAILED'
    const { POST: webhook } = await import('@/app/api/billing/phonepe-webhook/route')
    expect(await (await webhook(callbackRequest(txn))).json()).toEqual({ success: true, status: 'failed' })
    expect((await h.db.collection('billing_orders').findOne({ phonepe_transaction_id: txn })).status).toBe('failed')
    expect(await h.db.collection('billing_subscriptions').countDocuments({ user_id: 'u4' })).toBe(0)
  })

  it('a short payment is never activated', async () => {
    const txn = await checkout('u5')
    Object.assign(gateway.get(txn)!, { state: 'COMPLETED', reportAmount: 100 })
    const { settlePhonePeOrder } = await import('@/lib/billing/phonepe-settle')
    expect(await settlePhonePeOrder(txn)).toBe('failed')
    expect((await h.db.collection('billing_orders').findOne({ phonepe_transaction_id: txn })).status).toBe('created')
  })

  it('closed tab: the return route reports pending and the later callback still settles', async () => {
    const txn = await checkout('u6')
    const { GET: ret } = await import('@/app/api/billing/phonepe-callback/route')
    const r = await ret(new NextRequest(`https://app.test/api/billing/phonepe-callback?txn=${txn}`))
    expect(r.headers.get('location')).toContain('status=pending')
    gateway.get(txn)!.state = 'COMPLETED'
    const { POST: webhook } = await import('@/app/api/billing/phonepe-webhook/route')
    expect(await (await webhook(callbackRequest(txn))).json()).toEqual({ success: true, status: 'success' })
  })

  it('return route ignores junk transaction ids', async () => {
    const { GET: ret } = await import('@/app/api/billing/phonepe-callback/route')
    const r = await ret(new NextRequest('https://app.test/api/billing/phonepe-callback?txn=../../etc'))
    expect(r.headers.get('location')).toContain('status=failed')
  })
})
