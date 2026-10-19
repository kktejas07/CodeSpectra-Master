/**
 * Re-authentication for sensitive account actions (SEC-008 / SEC-011):
 * change login email, delete account, …
 *
 *  - password accounts   → current password
 *  - authenticator on    → a current TOTP code (when no password)
 *  - neither (Google / GitHub / SSO only) → a *real* sign-in within the last
 *    15 minutes. Only `reauth_at` counts — it is written by the sign-in routes
 *    (lib/db/admin updateUserLastLogin, OAuth uses the provider's auth_time),
 *    never by /api/auth/login-method or a session heartbeat.
 *
 * Impersonated sessions (SEC-010) can never pass.
 */
import bcrypt from 'bcryptjs'

export const REAUTH_WINDOW_MS = 15 * 60_000

export type ReauthNeeds = 'password' | 'code' | 'recent_sign_in'
export type ReauthResult = { ok: true } | { ok: false; status: 403; error: string; needs: ReauthNeeds }

interface ReauthUser {
  passwordHash?: unknown
  totp_enabled?: unknown
  totp_secret?: unknown
  reauth_at?: unknown
}

export function reauthMethod(user: ReauthUser): ReauthNeeds {
  if (typeof user.passwordHash === 'string' && user.passwordHash) return 'password'
  if (user.totp_enabled === true && typeof user.totp_secret === 'string' && user.totp_secret) return 'code'
  return 'recent_sign_in'
}

/** Pure. */
export function recentlySignedIn(user: ReauthUser, now = Date.now()): boolean {
  const raw = user.reauth_at
  const t = raw instanceof Date ? raw.getTime() : typeof raw === 'string' ? new Date(raw).getTime() : NaN
  return Number.isFinite(t) && now - t >= -60_000 && now - t < REAUTH_WINDOW_MS
}

const MESSAGES: Record<ReauthNeeds, string> = {
  password: 'Enter your current password to continue.',
  code: 'Enter a current code from your authenticator app to continue.',
  recent_sign_in: 'For your security, sign out and sign in again, then try within 15 minutes.',
}

export async function verifyReauth(
  user: ReauthUser & { _id?: unknown; id?: unknown },
  input: { password?: unknown; code?: unknown },
  ctx: { impersonating?: boolean } = {},
): Promise<ReauthResult> {
  if (ctx.impersonating) {
    return { ok: false, status: 403, error: 'Not available while viewing as another user.', needs: 'password' }
  }
  const needs = reauthMethod(user)
  const password = typeof input.password === 'string' ? input.password : ''
  const code = typeof input.code === 'string' ? input.code.replace(/\s/g, '') : ''
  let ok = false
  if (needs === 'password') {
    ok = !!password && (await bcrypt.compare(password, String(user.passwordHash)).catch(() => false))
    if (!ok) return { ok: false, status: 403, error: password ? 'That password is incorrect.' : MESSAGES.password, needs }
  } else if (needs === 'code') {
    const { consumeTotp } = await import('@/lib/totp')
    ok = !!code && (await consumeTotp(user as never, code))
    if (!ok) return { ok: false, status: 403, error: MESSAGES.code, needs }
  } else {
    ok = recentlySignedIn(user)
    if (!ok) return { ok: false, status: 403, error: MESSAGES.recent_sign_in, needs }
  }
  return { ok: true }
}
