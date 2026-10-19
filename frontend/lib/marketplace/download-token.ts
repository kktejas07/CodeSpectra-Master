/**
 * Signed, short-lived download links for digital purchases — pure (unit tested).
 * Token = base64url(json) + "." + base64url(HMAC-SHA256). Bound to order, line, file and
 * the buyer's user id; expires after DOWNLOAD_TTL_MS. The download count is enforced
 * separately and atomically (lib/marketplace/digital.ts), so a link can't exceed the limit.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const DOWNLOAD_TTL_MS = 5 * 60_000

export interface DownloadClaims { o: string; l: string; f: string; u: string; e: number }

const b64 = (b: Buffer) => b.toString('base64url')

export function signDownloadToken(key: Uint8Array, c: Omit<DownloadClaims, 'e'>, now = Date.now(), ttlMs = DOWNLOAD_TTL_MS): string {
  const body = b64(Buffer.from(JSON.stringify({ ...c, e: now + ttlMs })))
  return `${body}.${b64(createHmac('sha256', key).update(`mkt-dl:${body}`).digest())}`
}

export function verifyDownloadToken(key: Uint8Array, token: unknown, now = Date.now()): DownloadClaims | null {
  if (typeof token !== 'string' || token.length > 1000) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = createHmac('sha256', key).update(`mkt-dl:${body}`).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DownloadClaims
    if (!c || typeof c.o !== 'string' || typeof c.l !== 'string' || typeof c.f !== 'string' || typeof c.u !== 'string' || typeof c.e !== 'number') return null
    return c.e > now ? c : null
  } catch {
    return null
  }
}

/** Downloads left for a grant (limit 0 / missing = unlimited → Infinity). */
export function downloadsLeft(used: number, limit: number | null | undefined): number {
  if (!limit || limit <= 0) return Infinity
  return Math.max(0, limit - Math.max(0, used))
}
