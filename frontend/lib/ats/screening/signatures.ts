/**
 * Webhook authenticity checks (timing-safe). Every screening webhook calls one
 * of these BEFORE parsing the body as anything but bytes.
 */
import { createHmac, timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Meta: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(app secret, raw body)>`. */
export function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string | null | undefined): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return safeEqual(expected, header.trim())
}

/**
 * Vapi: the assistant's `server.secret` is sent back as `x-vapi-secret`
 * (or as a Bearer token when a Bearer credential is used).
 */
export function verifyVapiSecret(headers: { get(name: string): string | null }, secret: string | null | undefined): boolean {
  if (!secret) return false
  const direct = headers.get('x-vapi-secret')
  if (direct && safeEqual(direct.trim(), secret)) return true
  const auth = headers.get('authorization') || ''
  return auth.startsWith('Bearer ') && safeEqual(auth.slice(7).trim(), secret)
}

/**
 * Twilio: `X-Twilio-Signature` = base64(HMAC-SHA1(auth token, full URL + each
 * POST param name+value, sorted by name)).
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  header: string | null | undefined,
  authToken: string | null | undefined,
): boolean {
  if (!authToken || !header) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  return safeEqual(expected, header.trim())
}

/** Exotel status callbacks are unsigned: we put a shared secret in the callback URL (`?token=`). */
export function verifySharedToken(presented: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !presented) return false
  return safeEqual(presented.trim(), secret)
}
