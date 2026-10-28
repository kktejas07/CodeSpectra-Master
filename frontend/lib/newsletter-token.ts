/**
 * Newsletter one-click unsubscribe token (SEC-019).
 * HMAC-SHA256(email) under a server-derived key (lib/session deriveServerKey),
 * not the old public fallback secret. Compared in constant time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export function newsletterTokenWithKey(key: Uint8Array, email: string): string {
  return createHmac('sha256', Buffer.from(key)).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export function newsletterTokenMatches(key: Uint8Array, email: string, token: string): boolean {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return false
  const expected = Buffer.from(newsletterTokenWithKey(key, email))
  const got = Buffer.from(token)
  return got.length === expected.length && timingSafeEqual(got, expected)
}

async function key(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('newsletter-unsub')
}

export async function newsletterUnsubToken(email: string): Promise<string> {
  return newsletterTokenWithKey(await key(), email)
}

export async function verifyNewsletterUnsubToken(email: string, token: string): Promise<boolean> {
  return newsletterTokenMatches(await key(), email, token)
}
