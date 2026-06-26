/**
 * Razorpay server client + helpers.
 *
 * Credential resolution order (highest priority first):
 *   1. MongoDB `platform_settings.value.{razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret}`
 *      — admin-saved via /dashboard/admin/settings.
 *   2. Environment variables RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET.
 *
 * This dual-source pattern lets admins rotate keys without redeploying or
 * editing .env files. The `getRazorpay*` helpers are async because reading
 * from MongoDB requires a DB round-trip (cached for the process lifetime).
 */
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { readServerSecrets } from '@/lib/server-secrets-cache'

interface RazorpayCreds {
  key_id?: string
  key_secret?: string
  webhook_secret?: string
}

let _client: { id: string; secret: string; instance: Razorpay } | null = null

async function loadCreds(): Promise<RazorpayCreds> {
  const fromDb = await readServerSecrets()
  return {
    key_id: fromDb.razorpay_key_id || process.env.RAZORPAY_KEY_ID,
    key_secret: fromDb.razorpay_key_secret || process.env.RAZORPAY_KEY_SECRET,
    webhook_secret:
      fromDb.razorpay_webhook_secret || process.env.RAZORPAY_WEBHOOK_SECRET,
  }
}

/** True if EITHER MongoDB OR env has both key_id and key_secret. */
export async function isRazorpayConfigured(): Promise<boolean> {
  const c = await loadCreds()
  return Boolean(c.key_id && c.key_secret)
}

/** Async — returns a Razorpay instance using current credentials. */
export async function getRazorpay(): Promise<Razorpay> {
  const c = await loadCreds()
  if (!c.key_id || !c.key_secret) {
    throw new Error(
      'Razorpay is not configured — set credentials in Admin → Settings → Integrations, or RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in env.',
    )
  }
  if (_client && _client.id === c.key_id && _client.secret === c.key_secret) {
    return _client.instance
  }
  const instance = new Razorpay({ key_id: c.key_id, key_secret: c.key_secret })
  _client = { id: c.key_id, secret: c.key_secret, instance }
  return instance
}

/** Returns the publishable key_id (for the browser checkout iframe). */
export async function getPublishableKeyId(): Promise<string | null> {
  const c = await loadCreds()
  return c.key_id || null
}

/** Async signature verification — used by /api/billing/verify. */
export async function verifyPaymentSignature(args: {
  order_id: string
  payment_id: string
  signature: string
}): Promise<boolean> {
  const c = await loadCreds()
  if (!c.key_secret) return false
  const expected = crypto
    .createHmac('sha256', c.key_secret)
    .update(`${args.order_id}|${args.payment_id}`)
    .digest('hex')
  return safeEqual(expected, args.signature)
}

/** Async webhook signature verification — used by /api/billing/webhook. */
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const c = await loadCreds()
  if (!c.webhook_secret) return false
  const expected = crypto
    .createHmac('sha256', c.webhook_secret)
    .update(rawBody)
    .digest('hex')
  return safeEqual(expected, signature)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}
