import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { cookies } from 'next/headers'
import { users as getUsersCollection, getUserById, updateUserById, updateUserLastLogin } from '@/lib/db/admin'
import {
  clearPending2faCookie,
  clearSessionCookie,
  readSessionCookie,
  revokeSessionToken,
  setPending2faCookie,
  setSessionCookie,
} from '@/lib/session'
import { getAPIUser } from '@/lib/route-auth'
import { getUserEntitlements } from '@/lib/entitlements'
import { accountBlockReason } from '@/lib/auth-account'
import { normalizeUserRole } from '@/lib/rbac'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createUserSession, updateSessionHeartbeat } from '@/lib/db/sessions'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { isIpBlocked, isIpOutsideWhitelist, trackDeviceFingerprint, recordSecurityEvent } from '@/lib/db/security'
import { writeAuditLog } from '@/lib/db/misc'

export const runtime = 'nodejs'

const SESSION_COOKIE_NAME = 'codespectra_session'
const IMPERSONATOR_COOKIE = 'codespectra_impersonator'
const IMPERSONATING_COOKIE = 'codespectra_impersonating'

interface VerifiedIdToken {
  uid: string
  email: string
  emailVerified: boolean
  name?: string
}

type OAuthMethod = 'google' | 'github'

/** Verify a Firebase ID token (Admin SDK when configured, Google JWKS otherwise). */
async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedIdToken | null> {
  const auth = await getAdminAuthInstance()
  if (auth) {
    try {
      // checkRevoked: a password reset / "sign out everywhere" revokes refresh
      // tokens, so a still signed-in Firebase client can't mint a new session.
      const d = await auth.verifyIdToken(idToken, true)
      return { uid: d.uid, email: (d.email || '').toLowerCase().trim(), emailVerified: d.email_verified === true, name: d.name }
    } catch {
      return null
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || 'codespectra-f60cf'
  const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  )
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    if (!payload.sub) return null
    return {
      uid: payload.sub,
      email: String(payload.email || '').toLowerCase().trim(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    }
  } catch {
    return null
  }
}

type AccountResult =
  | { kind: 'ok'; doc: Record<string, unknown> & { _id: unknown }; created: boolean; linked: boolean }
  | { kind: 'conflict' }

/**
 * Find the account for a Google/GitHub identity. One account per email:
 * an existing account with the same (provider-verified) email is linked by
 * storing the Firebase uid on it, instead of creating a duplicate doc.
 * An unverified provider email never links to (or takes over) an account.
 */
async function resolveOAuthAccount(t: VerifiedIdToken): Promise<AccountResult> {
  const col = await getUsersCollection()
  const byId = await col.findOne({ $or: [{ id: t.uid }, { _id: t.uid }, { firebase_uid: t.uid }] } as never)
  if (byId) return { kind: 'ok', doc: byId as never, created: false, linked: false }

  if (t.email) {
    const escaped = t.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const byEmail = await col.findOne({ $or: [{ email: t.email }, { email: { $regex: `^${escaped}$`, $options: 'i' } }] } as never)
    if (byEmail) {
      if (!t.emailVerified) return { kind: 'conflict' }
      await col.updateOne({ _id: (byEmail as { _id: unknown })._id } as never, { $set: { firebase_uid: t.uid, updatedAt: new Date() } })
      return { kind: 'ok', doc: byEmail as never, created: false, linked: true }
    }
  }

  const now = new Date()
  const display = t.name || t.email.split('@')[0] || 'User'
  const doc = {
    _id: t.uid,
    id: t.uid,
    firebase_uid: t.uid,
    email: t.email,
    name: display,
    fullName: display,
    role: 'user',
    isActive: true,
    emailVerified: t.emailVerified,
    session_version: 1,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await col.insertOne(doc as never)
  } catch {
    // Concurrent first sign-in (popup + token listener) — read the winner.
    const again = await col.findOne({ $or: [{ id: t.uid }, { _id: t.uid }] } as never)
    if (again) return { kind: 'ok', doc: again as never, created: false, linked: false }
    throw new Error('could not create account')
  }
  return { kind: 'ok', doc: doc as never, created: true, linked: false }
}

/** Record a user session + track the device fingerprint for OAuth sign-ins. */
async function recordOAuthSession(request: NextRequest, uid: string, email: string, visitorId?: string) {
  try {
    const rawIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
    const userAgent = request.headers.get('user-agent') || 'Unknown device'
    // Heartbeat path: session POST fires on every 5-min heartbeat — update the existing
    // session instead of inserting a new doc. Create one only when none matched.
    const matched = await updateSessionHeartbeat(uid, rawIp, userAgent, visitorId)
    if (matched === 0) {
      await createUserSession({ user_id: uid, email, ip: rawIp, user_agent: userAgent, visitor_id: visitorId || undefined })
    }
    if (visitorId) {
      const fp = await trackDeviceFingerprint({ visitorId, user_id: uid, email, ip: rawIp, user_agent: userAgent })
      if (fp.multiAccountRisk) {
        await recordSecurityEvent({ type: 'auth.multi_account', severity: 'warning', user_id: uid, email, ip: rawIp, visitorId, detail: 'Same device fingerprint used by multiple accounts' })
      }
    }
  } catch (e) {
    console.error('[Session] recordOAuthSession failed:', e)
  }
}

/**
 * POST /api/auth/session — exchange a Firebase (Google / GitHub) ID token for
 * a CodeSpectra session. Also the client's 5-minute heartbeat.
 *
 * - Valid session for the same account already present → refresh it (heartbeat).
 * - Otherwise this is a sign-in: deactivated accounts are refused, and
 *   accounts with 2FA get a 5-minute pending cookie + `{ twoFactorRequired }`;
 *   the session is only issued by POST /api/auth/two-factor.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    // Never let the admin's own idToken overwrite an impersonated session.
    if (cookieStore.get(IMPERSONATING_COOKIE)?.value === '1') {
      return NextResponse.json({ ok: true, impersonating: true })
    }

    const body = (await request.json().catch(() => ({}))) as { idToken?: unknown; loginMethod?: unknown; visitorId?: unknown }
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    if (!idToken) {
      return NextResponse.json({ error: 'idToken required' }, { status: 400 })
    }
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId : undefined
    const loginMethod: OAuthMethod | null = body.loginMethod === 'google' || body.loginMethod === 'github' ? body.loginMethod : null

    const ipKey = clientLimiterKeyFromRequest(request, null)
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
    const limit = await rateLimitRedis(`oauth-session:ip:${ipKey}`, 60, 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
    }

    const token = await verifyFirebaseIdToken(idToken)
    if (!token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const resolved = await resolveOAuthAccount(token)
    if (resolved.kind === 'conflict') {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in with your email and password instead.', code: 'email_in_use' },
        { status: 409 },
      )
    }
    const doc = resolved.doc
    const uid = String(doc.id || doc._id)
    const email = String(doc.email || token.email || '')

    if (accountBlockReason(doc)) {
      await clearSessionCookie()
      return NextResponse.json({ error: 'This account has been deactivated. Contact your administrator.', code: 'account_disabled' }, { status: 403 })
    }

    // Heartbeat: a valid session for this same account → slide it, keep its id.
    const current = await readSessionCookie()
    if (current && current.uid === uid) {
      await setSessionCookie({ uid, email, role: current.role, sid: current.sid })
      await recordOAuthSession(request, uid, email, visitorId)
      return NextResponse.json({ ok: true })
    }

    // Passive token sync for a different Firebase account than the signed-in
    // session (e.g. a stale Google login in this browser): never swap accounts
    // silently — only an explicit sign-in (loginMethod set) may do that.
    if (current && !loginMethod) {
      return NextResponse.json({ ignored: true })
    }

    // Fresh sign-in.
    if (await isIpBlocked(rawIp) || await isIpOutsideWhitelist(rawIp)) {
      await recordSecurityEvent({ type: 'auth.blocked_ip', severity: 'critical', ip: rawIp, user_id: uid, email, detail: 'Blocked IP attempted OAuth sign-in' })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const role = normalizeUserRole(doc.role as string | undefined)
    if (doc.totp_enabled) {
      await setPending2faCookie({ uid, email, role, method: 'oauth' })
      await writeAuditLog({ action: 'auth.oauth_login', outcome: 'success', actor: email, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', detail: `${loginMethod || 'oauth'} verified; awaiting 2FA code`, user_id: uid }).catch(() => {})
      return NextResponse.json({ twoFactorRequired: true })
    }

    await clearPending2faCookie()
    await setSessionCookie({ uid, email, role })
    if (loginMethod) await updateUserLastLogin(uid, loginMethod).catch(() => {})
    await recordOAuthSession(request, uid, email, visitorId)
    await writeAuditLog({ action: 'auth.oauth_login', outcome: 'success', actor: email, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', detail: resolved.linked ? 'linked to existing account by verified email' : resolved.created ? 'account created' : undefined, user_id: uid }).catch(() => {})
    return NextResponse.json({ ok: true, user: { id: uid, email, role, name: (doc.fullName || doc.name || null) as string | null } })
  } catch (error) {
    console.error('[Session] Error creating session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE /api/auth/session — sign out this session (revokes the token server-side). */
export async function DELETE() {
  const cookieStore = await cookies()
  await revokeSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value)
  await revokeSessionToken(cookieStore.get(IMPERSONATOR_COOKIE)?.value)
  const response = NextResponse.json({ ok: true })
  const cleared = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 0 }
  response.cookies.set(SESSION_COOKIE_NAME, '', cleared)
  response.cookies.set(IMPERSONATOR_COOKIE, '', cleared)
  response.cookies.set(IMPERSONATING_COOKIE, '', { ...cleared, httpOnly: false })
  response.cookies.set('codespectra_2fa_pending', '', cleared)
  return response
}

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ user: null })

  const [profile, planKey] = await Promise.all([
    getUserById(user.id),
    // Effective plan from the one resolver (live subscription, then admin
    // override) — never the raw `user.plan` field. Falls back to free.
    getUserEntitlements(user.id).then((e) => e.planKey).catch(() => 'free'),
  ])
  updateUserById(user.id, { updatedAt: new Date() } as never).catch(() => {})
  const p = (profile || {}) as Record<string, unknown>
  return NextResponse.json({
    user: {
      uid: user.id,
      email: user.email || null,
      // Effective role (a tenant admin without an active tenant runs as `user`).
      role: user.role,
      plan: planKey || 'free',
      fullName: user.fullName || null,
      lastLoginMethod: user.lastLoginMethod || null,
      lastLoginAt: user.lastLoginAt || null,
      createdAt: p.createdAt || null,
      emailVerified: p.emailVerified !== false,
      has_enrolled_face: !!p.facial_biometric_template,
      onboardingGoal: (p.onboardingGoal as string) || null,
    },
  })
}
