/**
 * Anonymous visitor hash: HMAC-SHA256(daily random salt, ip | user agent | site).
 * The IP is never stored; the salt is random per UTC day and deleted after two
 * days, so a hash only tells same-day visits apart and can't be reversed or
 * linked across days. (Same approach as Plausible / Fathom.)
 */
import { createHmac } from 'node:crypto'
import { resolveClientIp } from '@/lib/client-ip'

export function visitorHash(salt: string, ip: string, ua: string, site: string): string {
  return createHmac('sha256', salt).update(`${ip}|${ua}|${site}`).digest('base64url').slice(0, 22)
}

/**
 * Client IP for hashing only. W4-15: same trusted-proxy resolution as rate
 * limits (lib/client-ip.ts) — raw forwarding headers are never trusted.
 */
export function clientIp(h: { get(name: string): string | null }): string {
  return resolveClientIp(h)
}

/** Daily-salted IP key for per-IP caps (the IP itself is never stored). */
export function ipCapKey(salt: string, ip: string): string {
  return 'ip:' + createHmac('sha256', salt).update(`cap|${ip}`).digest('base64url').slice(0, 22)
}
