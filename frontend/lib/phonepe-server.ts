/**
 * PhonePe server client + helpers.
 *
 * Credential resolution order (highest priority first):
 *   1. MongoDB `platform_settings.value.{phonepe_merchant_id, phonepe_salt_key, phonepe_salt_index}`
 *      — admin-saved via /dashboard/admin/settings.
 *   2. Environment variables PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY / PHONEPE_SALT_INDEX.
 *
 * PhonePe uses a different auth scheme than Razorpay:
 *   - X-VERIFY header = SHA256(base64(payload) + "/transaction/v1/order" + saltKey) + "###" + saltIndex
 *   - Response contains a shortUrl for payment
 *   - Webhook verification uses X-Verification-Header header
 */
import crypto from 'crypto'
import { readServerSecrets } from '@/lib/server-secrets-cache'

interface PhonePeCreds {
  merchantId?: string
  saltKey?: string
  saltIndex?: string
  webhookSecret?: string
}

let _creds: PhonePeCreds | null = null

async function loadCreds(): Promise<PhonePeCreds> {
  if (_creds) return _creds
  const fromDb = await readServerSecrets()
  _creds = {
    merchantId: fromDb.phonepe_merchant_id || process.env.PHONEPE_MERCHANT_ID,
    saltKey: fromDb.phonepe_salt_key || process.env.PHONEPE_SALT_KEY,
    saltIndex: fromDb.phonepe_salt_index || process.env.PHONEPE_SALT_INDEX || '1',
    webhookSecret: fromDb.phonepe_webhook_secret || process.env.PHONEPE_WEBHOOK_SECRET,
  }
  return _creds
}

export function isPhonePeConfigured(): boolean {
  // Note: caller should use await isPhonePeConfiguredAsync() for async check
  return Boolean(process.env.PHONEPE_MERCHANT_ID && process.env.PHONEPE_SALT_KEY)
}

export async function isPhonePeConfiguredAsync(): Promise<boolean> {
  const c = await loadCreds()
  return Boolean(c.merchantId && c.saltKey)
}

function getBaseUrl(): string {
  const env = process.env.PHONEPE_ENVIRONMENT
  if (env === 'production') {
    return 'https://api.phonepe.com'
  }
  // Default to sandbox/preprod
  return 'https://api-preprod.phonepe.com'
}

function generateXVerify(payload: string, endpoint: string, saltKey: string, saltIndex: string): string {
  const base64Payload = Buffer.from(payload).toString('base64')
  const stringToHash = base64Payload + endpoint + saltKey
  const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex')
  return `${sha256Hash}###${saltIndex}`
}

export interface PhonePeOrderResponse {
  success: boolean
  code: string
  message: string
  data?: {
    merchantTransactionId: string
    instrumentResponse?: {
      type?: string
      intentUrl?: string
      merchantUrl?: string
    }
  }
}

export interface PhonePeOrderRequest {
  merchantId: string
  merchantTransactionId: string
  merchantUserId: string
  amount: number
  redirectUrl: string
  redirectMode: string
  callbackUrl: string
  mobileNumber?: string
  email?: string
  message?: string
}

export async function createPhonePeOrder(params: {
  merchantTransactionId: string
  amount: number
  userId: string
  email: string
  callbackUrl: string
  redirectUrl: string
}): Promise<PhonePeOrderResponse> {
  const c = await loadCreds()
  if (!c.merchantId || !c.saltKey) {
    throw new Error('PhonePe is not configured')
  }

  const baseUrl = getBaseUrl()
  const endpoint = '/transaction/v1/order'

  const payload: PhonePeOrderRequest = {
    merchantId: c.merchantId,
    merchantTransactionId: params.merchantTransactionId,
    merchantUserId: params.userId,
    amount: params.amount,
    redirectUrl: params.redirectUrl,
    redirectMode: 'POST',
    callbackUrl: params.callbackUrl,
    email: params.email,
  }

  const payloadString = JSON.stringify(payload)
  const xVerify = generateXVerify(payloadString, endpoint, c.saltKey, c.saltIndex || '1')

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Verify': xVerify,
      'accept': 'application/json',
    },
    body: payloadString,
  })

  const result = await response.json() as PhonePeOrderResponse
  return result
}

export async function verifyPhonePeWebhook(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const c = await loadCreds()
  if (!c.webhookSecret) return false

  const expected = crypto
    .createHash('sha256')
    .update(rawBody + c.webhookSecret)
    .digest('hex')

  const a = Buffer.from(signature || '')
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface PhonePeStatusResponse {
  success: boolean
  code: string
  message: string
  data?: {
    merchantId: string
    merchantTransactionId: string
    transactionId: string
    amount: number
    state: string
    userId: string
  }
}

export async function getPhonePeTransactionStatus(
  merchantTransactionId: string,
): Promise<PhonePeStatusResponse> {
  const c = await loadCreds()
  if (!c.merchantId || !c.saltKey) {
    throw new Error('PhonePe is not configured')
  }

  const baseUrl = getBaseUrl()
  const endpoint = `/transaction/v1/status/${c.merchantId}/${merchantTransactionId}`
  const xVerify = generateXVerify('', endpoint, c.saltKey, c.saltIndex || '1')

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      'X-Verify': xVerify,
      'accept': 'application/json',
    },
  })

  const result = await response.json() as PhonePeStatusResponse
  return result
}

export function getPhonePeMerchantId(): string | null {
  return process.env.PHONEPE_MERCHANT_ID || null
}