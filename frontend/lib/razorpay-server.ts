/**
 * Razorpay server client + helpers.
 *
 * Reads `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from env. Throws when
 * called without credentials so /api/billing/* routes degrade gracefully.
 */
import Razorpay from 'razorpay'
import crypto from 'crypto'

let _client: Razorpay | null = null

export function getRazorpay(): Razorpay {
  if (_client) return _client
  const key_id = process.env.RAZORPAY_KEY_ID
  const key_secret = process.env.RAZORPAY_KEY_SECRET
  if (!key_id || !key_secret) {
    throw new Error('Razorpay is not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in /app/frontend/.env.local')
  }
  _client = new Razorpay({ key_id, key_secret })
  return _client
}

/**
 * Verify the order/payment signature returned by Razorpay Checkout.
 * Returns true if the signature matches the secret-derived HMAC.
 */
export function verifyPaymentSignature(args: {
  order_id: string
  payment_id: string
  signature: string
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET || ''
  if (!secret) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${args.order_id}|${args.payment_id}`)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(args.signature, 'utf8'),
  )
}

/**
 * Verify a webhook payload using the webhook secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8'),
  )
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
}
