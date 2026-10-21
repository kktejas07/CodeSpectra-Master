/**
 * Signed passport credential ids (pure; tests/skill-passport.test.ts).
 *
 * id = "csp1." + base64url(JSON {h: handle, n: nonce, t: issued ms}) + "." + base64url(HMAC-SHA256)[:22]
 *
 * The key comes from deriveServerKey('skill-passport') (lib/passport/db.ts).
 * The nonce is stored on the passport; "Reset links" rotates it, so every
 * older credential id stops verifying (revocation without a deny-list).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface CredentialPayload { h: string; n: string; t: number }

const PREFIX = 'csp1'
const SIG_LEN = 22 // 132 bits of HMAC — plenty for a lookup id

export function newNonce(): string {
  return randomBytes(12).toString('base64url')
}

/** Unguessable key for link-only sharing (?k=). */
export function newLinkKey(): string {
  return randomBytes(18).toString('base64url')
}

function mac(key: Uint8Array, body: string): string {
  return createHmac('sha256', Buffer.from(key)).update(`${PREFIX}.${body}`).digest('base64url').slice(0, SIG_LEN)
}

export function signCredential(key: Uint8Array, p: CredentialPayload): string {
  const body = Buffer.from(JSON.stringify({ h: p.h, n: p.n, t: p.t })).toString('base64url')
  return `${PREFIX}.${body}.${mac(key, body)}`
}

/** Signature + shape check. Returns null for anything forged or malformed. */
export function verifyCredential(key: Uint8Array, id: unknown): CredentialPayload | null {
  if (typeof id !== 'string' || id.length > 300) return null
  const m = /^csp1\.([A-Za-z0-9_-]{8,240})\.([A-Za-z0-9_-]{22})$/.exec(id)
  if (!m) return null
  const [, body, sig] = m
  const want = Buffer.from(mac(key, body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<CredentialPayload>
    if (typeof o.h !== 'string' || typeof o.n !== 'string' || typeof o.t !== 'number' || !Number.isFinite(o.t)) return null
    return { h: o.h, n: o.n, t: o.t }
  } catch {
    return null
  }
}

/** Constant-time compare of a link key (?k=) against the stored one. */
export function linkKeyMatches(given: unknown, stored: string | null | undefined): boolean {
  if (typeof given !== 'string' || !stored || given.length !== stored.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(stored))
}
