/**
 * Postal delivery/bounce webhook verification (audit A-037).
 *
 * Postal signs every webhook body with its server's RSA key:
 *   X-Postal-Signature-256  base64 RSA-SHA256 over the raw body (Postal ≥ 3)
 *   X-Postal-Signature      base64 RSA-SHA1  over the raw body (all versions)
 * The public key is shown in Postal (Webhooks page / the `postal-…._domainkey`
 * DNS record, "p=" value). Save it as `postal_webhook_public_key`.
 *
 * Also accepted (for setups without the key): the shared secret in
 * `postal_webhook_secret`, sent either as an `x-postal-webhook-secret` header
 * (added by a proxy) or as `?secret=` on the webhook URL configured in Postal.
 */
import crypto from 'node:crypto'

/** "p=" base64 / bare base64 / PEM → KeyObject, or null. */
export function parsePostalPublicKey(raw: string | null | undefined): crypto.KeyObject | null {
  const v = (raw || '').trim()
  if (!v) return null
  try {
    if (v.includes('BEGIN')) return crypto.createPublicKey(v)
    const b64 = (v.includes('p=') ? v.slice(v.indexOf('p=') + 2).split(/[;"]/)[0] : v).replace(/\s+/g, '')
    return crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' })
  } catch {
    return null
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export type PostalVerifyResult = { ok: true; via: 'rsa-sha256' | 'rsa-sha1' | 'secret' | 'unconfigured' } | { ok: false; reason: string }

export function verifyPostalWebhook(input: {
  rawBody: string
  headers: { get(name: string): string | null }
  querySecret?: string | null
  publicKey?: string | null
  sharedSecret?: string | null
  production: boolean
}): PostalVerifyResult {
  const key = parsePostalPublicKey(input.publicKey)
  const secret = (input.sharedSecret || '').trim()
  const body = Buffer.from(input.rawBody, 'utf8')

  if (key) {
    const s256 = input.headers.get('x-postal-signature-256')
    const s1 = input.headers.get('x-postal-signature')
    try {
      if (s256 && crypto.verify('sha256', body, key, Buffer.from(s256, 'base64'))) return { ok: true, via: 'rsa-sha256' }
      if (s1 && crypto.verify('sha1', body, key, Buffer.from(s1, 'base64'))) return { ok: true, via: 'rsa-sha1' }
    } catch {
      // malformed signature → fall through
    }
  }
  if (secret) {
    const given = input.headers.get('x-postal-webhook-secret') || input.headers.get('x-postal-secret') || input.querySecret || ''
    if (given && safeEqual(given, secret)) return { ok: true, via: 'secret' }
  }
  if (!key && !secret) {
    // Fail closed in production: an unverified webhook must not change delivery state.
    return input.production ? { ok: false, reason: 'not_configured' } : { ok: true, via: 'unconfigured' }
  }
  return { ok: false, reason: 'bad_signature' }
}
