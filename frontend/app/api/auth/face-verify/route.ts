import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { writeAuditLog } from '@/lib/db/misc'
import { createUserSession } from '@/lib/db/sessions'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clearPending2faCookie, clearPendingFaceEmailCookie, setPending2faCookie, setPendingFaceEmailCookie, setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { accountBlockReason } from '@/lib/auth-account'
import { checkAuthThrottle, clearAuthFailures, recordAuthFailure } from '@/lib/auth-throttle'
import { isIpBlocked, isIpOutsideWhitelist } from '@/lib/db/security'
import { matchAllFrames, parseLivenessClaim } from '@/lib/auth-face-liveness'
import { faceSignInAllowed, faceSignInNextStep } from '@/lib/auth-trusted-device'
import { issueFaceEmailCode, trustedDeviceFor } from '@/lib/trusted-devices'

import { openFaceTemplate } from '@/lib/identity-media'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GENERIC_FAIL = 'Face sign-in didn’t work. Try again, or use your password.'

/**
 * POST /api/auth/face-verify — face sign-in.
 * Body: { email, descriptors: number[128][] (2–4 frames), liveness: { challenge, passed } }
 *
 * The descriptors are computed in the browser, so the server can't prove
 * they came from a live camera. A match is therefore only enough on a
 * device this account already trusts (signed `cs_trusted_device` cookie
 * set after a full sign-in). On a new device the user must also enter a
 * code we email them (POST /api/auth/face-email-code). Accounts with an
 * authenticator app still finish with that code (POST /api/auth/two-factor).
 *
 * → { user } | { twoFactorRequired: true } | { emailCodeRequired: true }
 */
export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = await rateLimitRedis(`face-login:ip:${ipKey}`, 20, 3600_000)
    if (!ipCheck.ok) {
      return NextResponse.json({ error: 'Too many face sign-in attempts from this location. Try again later.' }, { status: 429 })
    }

    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
    if (await isIpBlocked(rawIp) || await isIpOutsideWhitelist(rawIp)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as { email?: unknown; descriptors?: unknown; liveness?: unknown }
    const normalizedEmail = typeof body.email === 'string' ? body.email.toLowerCase().trim().slice(0, 320) : ''
    const claim = parseLivenessClaim({ descriptors: body.descriptors, liveness: body.liveness })
    if (!normalizedEmail || !claim) {
      return NextResponse.json({ error: 'Enter your email and complete the camera check.' }, { status: 400 })
    }

    const throttle = await checkAuthThrottle('face', normalizedEmail, rawIp)
    if (!throttle.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${throttle.retryAfterSec}s, or use your password.` }, { status: 429 })
    }
    const acctCheck = await rateLimitRedis(`face-login:acct:${normalizedEmail}`, 10, 3600_000)
    if (!acctCheck.ok) {
      return NextResponse.json({ error: 'Too many face sign-in attempts for this account. Use your password.' }, { status: 429 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ email: normalizedEmail })
    if (!user || accountBlockReason(user) || !faceSignInAllowed(user)) {
      await recordAuthFailure('face', normalizedEmail, rawIp)
      return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    }

    const uid = String(user.id || user._id)
    const template = await openFaceTemplate(user.facial_biometric_template)
    if (!template) {
      await recordAuthFailure('face', normalizedEmail, rawIp)
      return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    }
    const match = matchAllFrames(claim.descriptors, template)
    if (!match.ok) {
      await recordAuthFailure('face', normalizedEmail, rawIp)
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'denied', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'warning', user_id: uid, detail: `face did not match (score ${match.score.toFixed(3)}, challenge ${claim.challenge})` }).catch(() => {})
      return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    }
    await clearAuthFailures('face', normalizedEmail, rawIp)

    const role = normalizeUserRole(user.role)
    const email = String(user.email || normalizedEmail)
    {
      const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
      const { signInBlock } = await import('@/lib/auth-policy')
      const blocked = signInBlock(await getGeneralSettingsCached(), { role, emailVerified: user.emailVerified, email_verification_required: user.email_verification_required }, { method: 'face' })
      if (blocked) return NextResponse.json({ error: blocked.error, code: blocked.code }, { status: blocked.status })
    }
    const trusted = !!(await trustedDeviceFor(uid))
    const totpEnabled = !!(user.totp_enabled && user.totp_secret)
    const step = faceSignInNextStep({ trustedDevice: trusted, totpEnabled })
    const audit = (detail: string) =>
      writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: email, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid, detail }).catch(() => {})

    if (step === 'email_code') {
      const issued = await issueFaceEmailCode(uid, email)
      if (!issued.ok) {
        return issued.reason === 'rate_limited'
          ? NextResponse.json({ error: `We’ve sent several codes already. Try again in ${issued.retryAfterSec ?? 600}s, or use your password.` }, { status: 429 })
          : NextResponse.json({ error: 'We couldn’t send your sign-in code. Use your password instead.' }, { status: 503 })
      }
      await clearPending2faCookie()
      await setPendingFaceEmailCookie({ uid, email, role, challengeId: issued.challengeId })
      await audit('face matched on a new device; email code sent')
      return NextResponse.json({ emailCodeRequired: true })
    }

    await clearPendingFaceEmailCookie()
    if (step === 'totp') {
      await setPending2faCookie({ uid, email, role, method: 'face' })
      await audit('face matched on a trusted device; awaiting 2FA code')
      return NextResponse.json({ twoFactorRequired: true })
    }

    await setSessionCookie({ uid, email, role })
    await audit('face matched on a trusted device; signed in')
    createUserSession({ user_id: uid, email, ip: rawIp, user_agent: request.headers.get('user-agent') || 'Unknown device' }).catch(() => {})
    return NextResponse.json({ user: { id: uid, email, role, name: user.name || null } })
  } catch (error) {
    console.error('[FaceVerify] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
