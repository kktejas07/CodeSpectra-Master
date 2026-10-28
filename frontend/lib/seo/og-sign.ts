/**
 * W4-12: /og cards are rendered only from parameters our own server signed,
 * so nobody can mint codespectra.ai-hosted "Verified certificate" or "Job
 * opening" previews with arbitrary text.
 *
 * Key: OG_SIGNING_KEY, else SECRETS_ENCRYPTION_KEY, else the boot session
 * secret; with none of them (local dev) a per-process random key.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

let processKey: string | null = null

export function ogSigningKey(env: Record<string, string | undefined> = process.env): string {
  for (const v of [env.OG_SIGNING_KEY, env.SECRETS_ENCRYPTION_KEY, env.SESSION_SECRET_BOOT, env.SESSION_SECRET]) {
    const s = (v || '').trim()
    if (s.length >= 16 && !s.includes('•')) return s
  }
  if (!processKey) processKey = randomBytes(32).toString('hex')
  return processKey
}

/** Canonical string of the signed fields (order-independent of the query). */
export function ogCanonical(p: { title?: string | null; kind?: string | null; sub?: string | null }): string {
  return JSON.stringify([p.kind || '', p.title || '', p.sub || ''])
}

export function signOg(p: { title?: string | null; kind?: string | null; sub?: string | null }, key: string = ogSigningKey()): string {
  return createHmac('sha256', key).update(`og:v1:${ogCanonical(p)}`).digest('base64url').slice(0, 22)
}

export function verifyOg(p: { title?: string | null; kind?: string | null; sub?: string | null }, sig: string | null | undefined, key: string = ogSigningKey()): boolean {
  if (!sig || typeof sig !== 'string' || sig.length !== 22) return false
  const want = Buffer.from(signOg(p, key))
  const got = Buffer.from(sig)
  return want.length === got.length && timingSafeEqual(want, got)
}
