/**
 * PhonePe PG v1 (Standard Checkout) client.
 *
 * !! NEEDS A SANDBOX TEST before it is enabled. Written against the public
 * PG v1 docs; not yet exercised against the PhonePe UAT environment. PhonePe
 * is never chosen for checkout unless PHONEPE_ENABLED=true is set as well as
 * the credentials (see isPhonePeConfiguredAsync).
 *
 * Credentials (read on every call, no process-lifetime cache):
 *   platform_settings server secrets phonepe_merchant_id / phonepe_salt_key /
 *   phonepe_salt_index, else env PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY /
 *   PHONEPE_SALT_INDEX. PHONEPE_ENVIRONMENT=production selects live hosts.
 *
 * Protocol:
 *   pay     POST {host}/pg/v1/pay   body {request: base64(json)}
 *           X-VERIFY = sha256(base64 + "/pg/v1/pay" + saltKey) + "###" + saltIndex
 *           → data.instrumentResponse.redirectInfo.url (hosted pay page)
 *   status  GET  {host}/pg/v1/status/{merchantId}/{merchantTransactionId}
 *           X-VERIFY = sha256(path + saltKey) + "###" + saltIndex, X-MERCHANT-ID
 *   S2S callback  POST callbackUrl body {response: base64(json)}
 *           X-VERIFY = sha256(response + saltKey) + "###" + saltIndex
 *   Browser redirect (redirectMode REDIRECT): GET redirectUrl — carries nothing
 *           trusted; the return route re-checks status server-side.
 */
import crypto from 'crypto'
import { readServerSecrets } from '@/lib/server-secrets-cache'

interface PhonePeCreds {
  merchantId?: string
  saltKey?: string
  saltIndex: string
}

async function loadCreds(): Promise<PhonePeCreds> {
  const fromDb = await readServerSecrets().catch(() => ({} as Record<string, string | undefined>))
  return {
    merchantId: fromDb.phonepe_merchant_id || process.env.PHONEPE_MERCHANT_ID,
    saltKey: fromDb.phonepe_salt_key || process.env.PHONEPE_SALT_KEY,
    saltIndex: fromDb.phonepe_salt_index || process.env.PHONEPE_SALT_INDEX || '1',
  }
}

/** Credentials present AND explicitly enabled (kept off until sandbox-tested). */
export async function isPhonePeConfiguredAsync(): Promise<boolean> {
  if (process.env.PHONEPE_ENABLED !== 'true') return false
  const c = await loadCreds()
  return Boolean(c.merchantId && c.saltKey)
}

function host(): string {
  return process.env.PHONEPE_ENVIRONMENT === 'production'
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox'
}

// ─── Pure helpers (exported for tests) ─────────────────────────────────────

export function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

/** X-VERIFY for a request: sha256(body64 + path + saltKey)###saltIndex. */
export function phonePeChecksum(base64OrEmpty: string, path: string, saltKey: string, saltIndex: string): string {
  return `${sha256Hex(base64OrEmpty + path + saltKey)}###${saltIndex}`
}

/** Verify the X-VERIFY header PhonePe sends on the S2S callback. */
export function verifyCallbackChecksum(response64: string, xVerify: string, saltKey: string, saltIndex: string): boolean {
  const expected = `${sha256Hex(response64 + saltKey)}###${saltIndex}`
  const a = Buffer.from(xVerify || '')
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** PhonePe ids: alphanumeric plus _ and -, max 35 (txn) / 36 (user). */
export function phonePeSafeId(raw: string, max: number): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, max) || 'U'
}

// ─── API ───────────────────────────────────────────────────────────────────

export interface PhonePePayResponse {
  success: boolean
  code: string
  message: string
  data?: {
    merchantId?: string
    merchantTransactionId?: string
    instrumentResponse?: { type?: string; redirectInfo?: { url?: string; method?: string } }
  }
}

export async function createPhonePePayment(params: {
  merchantTransactionId: string
  amount: number
  userId: string
  redirectUrl: string
  callbackUrl: string
}): Promise<{ payUrl: string }> {
  const c = await loadCreds()
  if (!c.merchantId || !c.saltKey) throw new Error('No payment provider configured: PhonePe credentials missing')
  if (!Number.isInteger(params.amount) || params.amount < 100) throw new Error('PhonePe amount must be at least 100 paise')

  const path = '/pg/v1/pay'
  const payload = {
    merchantId: c.merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: phonePeSafeId(params.userId, 36),
    amount: params.amount,
    redirectUrl: params.redirectUrl,
    redirectMode: 'REDIRECT',
    callbackUrl: params.callbackUrl,
    paymentInstrument: { type: 'PAY_PAGE' },
  }
  const body64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  const res = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      'X-VERIFY': phonePeChecksum(body64, path, c.saltKey, c.saltIndex),
    },
    body: JSON.stringify({ request: body64 }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => null)) as PhonePePayResponse | null
  const url = json?.data?.instrumentResponse?.redirectInfo?.url
  if (!res.ok || !json?.success || !url) {
    console.error('[phonepe] pay failed', { status: res.status, code: json?.code })
    throw new Error('PhonePe order creation failed')
  }
  return { payUrl: url }
}

export interface PhonePeStatus {
  success: boolean
  code: string
  message?: string
  data?: {
    merchantId?: string
    merchantTransactionId?: string
    transactionId?: string
    amount?: number
    state?: 'COMPLETED' | 'FAILED' | 'PENDING' | string
    responseCode?: string
  }
}

export async function getPhonePeTransactionStatus(merchantTransactionId: string): Promise<PhonePeStatus> {
  const c = await loadCreds()
  if (!c.merchantId || !c.saltKey) throw new Error('PhonePe is not configured')
  const txn = phonePeSafeId(merchantTransactionId, 35)
  const path = `/pg/v1/status/${encodeURIComponent(c.merchantId)}/${txn}`
  const res = await fetch(`${host()}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      'X-VERIFY': phonePeChecksum('', path, c.saltKey, c.saltIndex),
      'X-MERCHANT-ID': c.merchantId,
    },
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => null)) as PhonePeStatus | null
  return json ?? { success: false, code: 'BAD_RESPONSE' }
}

/**
 * Verify and decode an S2S callback body. Returns null when the checksum or
 * payload is invalid. The decoded state is still re-checked via the status
 * API before an order is activated.
 */
export async function decodePhonePeCallback(rawBody: string, xVerify: string): Promise<PhonePeStatus | null> {
  const c = await loadCreds()
  if (!c.saltKey) return null
  let response64 = ''
  try {
    response64 = String((JSON.parse(rawBody) as { response?: unknown }).response || '')
  } catch {
    return null
  }
  if (!response64 || !verifyCallbackChecksum(response64, xVerify, c.saltKey, c.saltIndex)) return null
  try {
    return JSON.parse(Buffer.from(response64, 'base64').toString('utf8')) as PhonePeStatus
  } catch {
    return null
  }
}

/**
 * Refund (PG v1) — used by the marketplace buyer part. NEEDS A SANDBOX TEST.
 *   POST {host}/pg/v1/refund  body {request: base64(json)}
 *   X-VERIFY = sha256(base64 + "/pg/v1/refund" + saltKey) + "###" + saltIndex
 * `originalTransactionId` is the merchantTransactionId of the payment; `merchantTransactionId`
 * is a NEW id for this refund (also the idempotency key on PhonePe's side).
 */
export async function refundPhonePePayment(params: {
  merchantTransactionId: string
  originalTransactionId: string
  amount: number
  userId: string
  callbackUrl: string
}): Promise<{ ok: boolean; code: string; state?: string }> {
  const c = await loadCreds()
  if (!c.merchantId || !c.saltKey) throw new Error('PhonePe is not configured')
  if (!Number.isInteger(params.amount) || params.amount < 1) throw new Error('Refund amount must be a positive integer (paise)')
  const path = '/pg/v1/refund'
  const payload = {
    merchantId: c.merchantId,
    merchantUserId: phonePeSafeId(params.userId, 36),
    originalTransactionId: phonePeSafeId(params.originalTransactionId, 35),
    merchantTransactionId: phonePeSafeId(params.merchantTransactionId, 35),
    amount: params.amount,
    callbackUrl: params.callbackUrl,
  }
  const body64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  const res = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json', 'X-VERIFY': phonePeChecksum(body64, path, c.saltKey, c.saltIndex) },
    body: JSON.stringify({ request: body64 }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await res.json().catch(() => null)) as PhonePeStatus | null
  if (!res.ok || !json?.success) console.error('[phonepe] refund failed', { status: res.status, code: json?.code })
  return { ok: !!(res.ok && json?.success), code: json?.code || `HTTP_${res.status}`, state: json?.data?.state }
}
