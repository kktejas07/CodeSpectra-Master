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

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = await rateLimitRedis(`login:ip:${ipKey}`, 10, 60_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.` },
        { status: 429 },
      )
    }
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')

    const { email, password, totpToken } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    const ident = String(email).toLowerCase().trim()

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
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
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
          { error: `Too many attempts. Try again in ${emailCheck.retryAfterSec}s.` },
          { status: 429 },
        )
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const uid = String(user.id || user._id)
    const role = normalizeUserRole(user.role as string | undefined | null)

    if (user.totp_enabled) {
      if (!totpToken) return NextResponse.json({ twoFactorRequired: true })
      const { checkTotp } = await import('@/lib/totp')
      const isValid = checkTotp(totpToken, user.totp_secret)
      if (!isValid) return NextResponse.json({ error: 'Invalid two-factor code' }, { status: 401 })
    }

    // ponytail: 30d matches a mobile session (no cookies to refresh); logout
    // and password-change still revoke via session_version like web.
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
