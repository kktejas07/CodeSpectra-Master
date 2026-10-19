/**
 * Link tokens.
 *  - Manage / unsubscribe links: stateless HMAC over (subscriber id, rotating
 *    nonce, scope). No expiry (an unsubscribe link must keep working), revoked
 *    by rotating `token_nonce`.
 *  - Email confirmation (double opt-in): a signed purpose JWT, 72 h, bound to
 *    the pending request so an old link can't apply a newer change.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

/** 'all' = every channel/topic; 'email' | 'whatsapp' = that channel; 'topic:events' = that topic. */
export type LinkScope = 'all' | 'manage' | 'email' | 'whatsapp' | `topic:${string}`

export function linkTokenWithKey(key: Uint8Array, subscriberId: string, nonce: string, scope: LinkScope): string {
  return createHmac('sha256', Buffer.from(key)).update(`${subscriberId}.${nonce}.${scope}`).digest('base64url').slice(0, 32)
}

export function verifyLinkTokenWithKey(key: Uint8Array, subscriberId: string, nonce: string, scope: LinkScope, token: unknown): boolean {
  if (typeof token !== 'string' || token.length !== 32) return false
  const a = Buffer.from(linkTokenWithKey(key, subscriberId, nonce, scope))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function key(): Promise<Uint8Array> {
  const { deriveServerKey } = await import('@/lib/session')
  return deriveServerKey('subscriptions-links')
}

export async function linkToken(subscriberId: string, nonce: string, scope: LinkScope): Promise<string> {
  return linkTokenWithKey(await key(), subscriberId, nonce, scope)
}

export async function verifyLinkToken(subscriberId: string, nonce: string, scope: LinkScope, token: unknown): Promise<boolean> {
  return verifyLinkTokenWithKey(await key(), subscriberId, nonce, scope, token)
}

export function isLinkScope(s: unknown): s is LinkScope {
  return typeof s === 'string' && (s === 'all' || s === 'manage' || s === 'email' || s === 'whatsapp' || /^topic:[a-z]{2,20}$/.test(s))
}

export interface ConfirmTokenData { id: string; n: string; e: string; r: string }

export async function signConfirmToken(d: ConfirmTokenData): Promise<string> {
  const { signPurposeToken } = await import('@/lib/session')
  return signPurposeToken('subscription_confirm', { ...d }, '72h')
}

export async function verifyConfirmToken(token: unknown): Promise<ConfirmTokenData | null> {
  if (typeof token !== 'string' || token.length > 2000) return null
  const { verifyPurposeToken } = await import('@/lib/session')
  const d = await verifyPurposeToken<ConfirmTokenData>('subscription_confirm', token)
  return d && typeof d.id === 'string' && typeof d.n === 'string' && typeof d.e === 'string' && typeof d.r === 'string' ? d : null
}
