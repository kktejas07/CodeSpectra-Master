/**
 * Webhook signing (inbound workflow triggers and outbound webhook steps).
 *
 * Header:  X-CodeSpectra-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>
 * The timestamp is part of the signed string, so a captured request can only
 * be replayed inside the tolerance window (default 5 minutes).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SIGNATURE_HEADER = 'x-codespectra-signature'
export const DEFAULT_TOLERANCE_SEC = 300

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`
}

export function maskSecret(secret: string | null | undefined): string | null {
  if (!secret) return null
  return `whsec_…${secret.slice(-4)}`
}

export function computeSignature(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export function signatureHeader(secret: string, rawBody: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000)
  return `t=${t},v1=${computeSignature(secret, t, rawBody)}`
}

export function parseSignatureHeader(header: string | null | undefined): { t: number; v1: string[] } | null {
  if (!header || header.length > 1000) return null
  let t = NaN
  const v1: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => (s || '').trim())
    if (k === 't') t = Number(v)
    else if (k === 'v1' && /^[a-f0-9]{64}$/i.test(v)) v1.push(v.toLowerCase())
  }
  if (!Number.isFinite(t) || !v1.length) return null
  return { t, v1 }
}

export type VerifyResult = { ok: true; t: number; sig: string } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' }

/**
 * The HMAC is checked BEFORE the timestamp, so "expired" is only ever reported for a correctly
 * signed request (a stale or bogus header can't tell a prober anything). On success returns the
 * signed timestamp and the matching signature (the replay-store key).
 */
export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | null | undefined,
  now: Date = new Date(),
  toleranceSec = DEFAULT_TOLERANCE_SEC,
): VerifyResult {
  if (!header) return { ok: false, reason: 'missing' }
  const parsed = parseSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed' }
  const expected = Buffer.from(computeSignature(secret, parsed.t, rawBody), 'hex')
  const sig = parsed.v1.find((s) => {
    const got = Buffer.from(s, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
  if (!sig) return { ok: false, reason: 'mismatch' }
  if (Math.abs(Math.floor(now.getTime() / 1000) - parsed.t) > toleranceSec) return { ok: false, reason: 'expired' }
  return { ok: true, t: parsed.t, sig }
}
