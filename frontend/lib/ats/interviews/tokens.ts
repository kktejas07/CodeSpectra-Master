/**
 * Signed tokens for candidate links and OAuth state, plus at-rest encryption
 * for meeting-provider credentials. The pure functions take the key so they can
 * be unit tested (tests/ats-interviews.test.ts); `*Key()` derive it on the server.
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, body)).
 * Payload: { k: kind, i: subject id, n: nonce, e: expiry ms, t?: tenant, u?: user, p?: provider }.
 * Candidate links carry the interview's `token_nonce`; rotating it (reschedule,
 * cancel) kills older links.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export type TokenKind = 'join' | 'sched' | 'oauth'

export interface SignedPayload {
  k: TokenKind
  i: string
  n: string
  e: number
  t?: string
  u?: string
  p?: string
}

const b64u = (buf: Buffer) => buf.toString('base64url')

export function newNonce(): string {
  return randomBytes(12).toString('hex')
}

export function signToken(key: Uint8Array, p: SignedPayload): string {
  const clean: SignedPayload = { k: p.k, i: p.i, n: p.n, e: p.e }
  if (p.t) clean.t = p.t
  if (p.u) clean.u = p.u
  if (p.p) clean.p = p.p
  const body = b64u(Buffer.from(JSON.stringify(clean)))
  const sig = b64u(createHmac('sha256', Buffer.from(key)).update(body).digest())
  return `${body}.${sig}`
}

/** Signature, kind, shape and expiry. Null for anything invalid. */
export function verifyToken(key: Uint8Array, token: unknown, kind: TokenKind, now = Date.now()): SignedPayload | null {
  if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  const [body, sig] = token.split('.')
  const expected = createHmac('sha256', Buffer.from(key)).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let p: Partial<SignedPayload>
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!p || p.k !== kind || typeof p.i !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') return null
  if (p.e < now) return null
  return p as SignedPayload
}

// ─── At-rest encryption (AES-256-GCM) ────────────────────────────────────────

/** "v1." + base64url(iv | tag | ciphertext). */
export function encryptWithKey(key: Uint8Array, plaintext: string): string {
  const k = createHash('sha256').update(Buffer.from(key)).digest() // normalise to 32 bytes
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return 'v1.' + b64u(Buffer.concat([iv, c.getAuthTag(), ct]))
}

export function decryptWithKey(key: Uint8Array, box: string): string | null {
  if (typeof box !== 'string' || !box.startsWith('v1.')) return null
  try {
    const raw = Buffer.from(box.slice(3), 'base64url')
    const k = createHash('sha256').update(Buffer.from(key)).digest()
    const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ─── Server keys ─────────────────────────────────────────────────────────────

async function derive(label: string): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey(label)
}

export const interviewLinkKey = () => derive('ats-interview-link')
export const oauthStateKey = () => derive('ats-meeting-oauth')

/**
 * Credentials key: `ATS_ENCRYPTION_KEY` (32+ chars) when set, else derived from
 * the session secret. Rotating either means tenants reconnect their providers.
 */
export async function credentialsKey(): Promise<Uint8Array> {
  const env = (process.env.ATS_ENCRYPTION_KEY || '').trim()
  if (env.length >= 32) return new Uint8Array(createHash('sha256').update(`ats-creds:${env}`).digest())
  return derive('ats-meeting-credentials')
}

export async function encryptJson(value: unknown): Promise<string> {
  return encryptWithKey(await credentialsKey(), JSON.stringify(value))
}

export async function decryptJson<T>(box: string | null | undefined): Promise<T | null> {
  if (!box) return null
  const s = decryptWithKey(await credentialsKey(), box)
  if (s === null) return null
  try { return JSON.parse(s) as T } catch { return null }
}
