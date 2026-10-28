/**
 * Signed ATS team-invite tokens + the accept decision (pure; tests/ats-access.test.ts).
 *
 * Token = base64url(JSON {m: member id, n: nonce, e: expiry ms}) + "." + base64url(HMAC-SHA256).
 * The nonce is stored on the member; a resend rotates it, so older links stop working.
 * The key comes from deriveServerKey('ats-invite') in lib/ats/access.ts.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'

export const ATS_INVITE_TTL_DAYS = 7

export interface InviteTokenPayload { m: string; n: string; e: number }

const b64u = (buf: Buffer) => buf.toString('base64url')

export function newInviteNonce(): string {
  return randomBytes(16).toString('hex')
}

export function signInviteToken(key: Uint8Array, p: InviteTokenPayload): string {
  const body = b64u(Buffer.from(JSON.stringify({ m: p.m, n: p.n, e: p.e })))
  const sig = b64u(createHmac('sha256', Buffer.from(key)).update(body).digest())
  return `${body}.${sig}`
}

/** Signature + shape + expiry. Returns null for anything invalid. */
export function verifyInviteToken(key: Uint8Array, token: unknown, now = Date.now()): InviteTokenPayload | null {
  if (typeof token !== 'string' || token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  const [body, sig] = token.split('.')
  const expected = createHmac('sha256', Buffer.from(key)).update(body).digest()
  let given: Buffer
  try { given = Buffer.from(sig, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let p: unknown
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  const o = p as Partial<InviteTokenPayload>
  if (!o || typeof o.m !== 'string' || typeof o.n !== 'string' || typeof o.e !== 'number') return null
  if (o.e < now) return null
  return { m: o.m, n: o.n, e: o.e }
}

export type InviteAcceptDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410; error: string }

/** Decide an accept once the token verified and the member was loaded. */
export function decideInviteAccept(input: {
  payload: InviteTokenPayload | null
  member: { id: string; status: string; email: string; user_id: string | null; invite_nonce?: string | null } | null
  user: { id: string; email: string } | null
  tenantActive: boolean
}): InviteAcceptDecision {
  const { payload, member, user } = input
  if (!payload) return { ok: false, status: 410, error: 'This invite link is invalid or has expired. Ask for a new one.' }
  if (!member || member.id !== payload.m) return { ok: false, status: 404, error: 'Invitation not found' }
  if (member.status === 'disabled') return { ok: false, status: 403, error: 'This invitation was withdrawn' }
  if (!member.invite_nonce || member.invite_nonce !== payload.n) {
    if (member.status === 'active' && user && member.user_id === user.id) return { ok: false, status: 409, error: "You've already joined this hiring team" }
    return { ok: false, status: 410, error: 'This invite link was replaced by a newer one. Use the latest email.' }
  }
  if (!input.tenantActive) return { ok: false, status: 400, error: 'This organization is not active' }
  if (!user) return { ok: false, status: 400, error: 'Sign in to accept' }
  if (member.email.toLowerCase() !== (user.email || '').toLowerCase()) {
    return { ok: false, status: 403, error: `This invitation is for ${member.email}. Sign in with that email to accept.` }
  }
  if (member.user_id && member.user_id !== user.id) return { ok: false, status: 409, error: 'This invitation was accepted by another account' }
  return { ok: true }
}
