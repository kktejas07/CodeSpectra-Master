/**
 * POST /api/auth/mobile-token — mint a long-lived session JWT for the
 * mobile app (stored in SecureStore, sent as `Authorization: Bearer`).
 *
 * Same credential verification as web login (bcrypt + TOTP passthrough +
 * IP rate limits), minus the browser-only layers: no Turnstile (no DOM to
 * render the widget in a native app) and no session cookie — the token IS
 * the credential. Brute-force and IP-block protections still apply.
 */
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { signSessionToken } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { updateUserLastLogin } from '@/lib/db/admin'
import { accountBlockReason } from '@/lib/auth-account'
import { checkAuthThrottle, recordAuthFailure, clearAuthFailures } from '@/lib/auth-throttle'
import { isIpBlocked } from '@/lib/db/security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = await rateLimitRedis(`login:ip:${ipKey}`, 10, 60_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: ipCheck.retryAfterSec } },
        { status: 429 },
      )
    }
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')

    const { email, password, totpToken } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required', code: 'auth_email_password_required' }, { status: 400 })
    }
    const ident = String(email).toLowerCase().trim()
    if (await isIpBlocked(rawIp)) {
      return NextResponse.json({ error: 'Access denied', code: 'access_denied' }, { status: 403 })
    }
    const throttle = await checkAuthThrottle('login', ident, rawIp)
    if (!throttle.ok) {
      return NextResponse.json({ error: `Too many failed attempts. Try again in ${throttle.retryAfterSec}s.`, code: 'auth_too_many_failed', params: { seconds: throttle.retryAfterSec } }, { status: 429 })
    }

    const db = await getMongoDb()
    const escaped = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const user = await db.collection('user').findOne({
      $or: [
        { email: ident },
        { email: { $regex: `^${escaped}$`, $options: 'i' } },
        ...(!ident.includes('@') && ident
          ? [{ name: { $regex: `^${escaped}$`, $options: 'i' } }, { mobile: ident }]
          : []),
      ],
    })
    if (!user || !user.passwordHash) {
      await recordAuthFailure('login', ident, rawIp)
      return NextResponse.json({ error: 'Invalid email or password', code: 'auth_invalid_credentials' }, { status: 401 })
    }

    let valid = false
    try {
      valid = await bcrypt.compare(String(password), String(user.passwordHash))
    } catch {
      valid = false
    }
    if (!valid) {
      const emailCheck = await rateLimitRedis(`login:email:${ident}`, 5, 60_000)
      if (!emailCheck.ok) {
        return NextResponse.json(
          { error: `Too many attempts. Try again in ${emailCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: emailCheck.retryAfterSec } },
          { status: 429 },
        )
      }
      await recordAuthFailure('login', ident, rawIp)
      return NextResponse.json({ error: 'Invalid email or password', code: 'auth_invalid_credentials' }, { status: 401 })
    }

    if (accountBlockReason(user)) {
      return NextResponse.json({ error: 'This account has been deactivated. Contact your administrator.', code: 'account_disabled' }, { status: 403 })
    }

    const uid = String(user.id || user._id)
    const role = normalizeUserRole(user.role as string | undefined | null)

    {
      const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
      const { signInBlock } = await import('@/lib/auth-policy')
      const blocked = signInBlock(await getGeneralSettingsCached(), { role, emailVerified: user.emailVerified, email_verification_required: user.email_verification_required }, { method: 'mobile' })
      if (blocked) return NextResponse.json({ error: blocked.error, code: blocked.code }, { status: blocked.status })
    }

    if (user.totp_enabled) {
      if (!totpToken) return NextResponse.json({ twoFactorRequired: true })
      const { consumeTotp } = await import('@/lib/totp')
      const isValid = await consumeTotp(user, totpToken)
      if (!isValid) await recordAuthFailure('login', ident, rawIp)
      if (!isValid) return NextResponse.json({ error: 'Invalid two-factor code', code: 'auth_invalid_2fa' }, { status: 401 })
    }

    // SEC-009: an admin past the 2FA grace period must turn 2FA on (web) first —
    // a 30-day mobile token must not be a way around it.
    {
      const { getAdmin2faState } = await import('@/lib/admin-2fa')
      const tfa = await getAdmin2faState(uid, role).catch(() => ({ status: 'ok' as const }))
      if (tfa.status === 'required') {
        return NextResponse.json(
          { error: 'Turn on two-factor authentication on the web (Account → Security) before signing in on mobile.', code: 'admin_2fa_required' },
          { status: 403 },
        )
      }
    }

    // ponytail: 30d matches a mobile session (no cookies to refresh); logout
    // and password-change still revoke via session_version like web.
    await clearAuthFailures('login', ident, rawIp)
    const token = await signSessionToken({ uid, email: user.email, role }, '30d')
    await updateUserLastLogin(uid, 'email').catch(() => {})
    await writeAuditLog({
      action: 'auth.mobile-login', outcome: 'success', actor: ident, actorIp: rawIp,
      resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid,
    }).catch(() => {})

    return NextResponse.json({
      token,
      user: {
        id: uid,
        email: user.email,
        role,
        name: (user.fullName || user.name || null) as string | null,
      },
      // Same rule as the web dashboard banner: role=user without a face
      // template must enroll before proctored assessments.
      faceEnrollmentRequired: role === 'user' && !(user as { facial_biometric_template?: unknown }).facial_biometric_template,
    })
  } catch (e) {
    console.error('[mobile-token] Error:', e)
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
