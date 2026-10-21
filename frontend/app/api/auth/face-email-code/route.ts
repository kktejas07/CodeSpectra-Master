import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { writeAuditLog } from '@/lib/db/misc'
import { createUserSession } from '@/lib/db/sessions'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import {
  clearPendingFaceEmailCookie,
  readPendingFaceEmailCookie,
  setPending2faCookie,
  setPendingFaceEmailCookie,
  setSessionCookie,
} from '@/lib/session'
import { accountBlockReason } from '@/lib/auth-account'
import { faceSignInAllowed, faceSignInNextStep } from '@/lib/auth-trusted-device'
import { issueFaceEmailCode, trustCurrentDevice, verifyFaceEmailCode } from '@/lib/trusted-devices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXPIRED = { error: 'Your sign-in took too long. Start again.', code: 'auth_signin_timeout', expired: true }

/**
 * POST /api/auth/face-email-code — second step of face sign-in on a new
 * device. Needs the pending cookie set by POST /api/auth/face-verify.
 *
 * Body: { code: "123456" } → { user } | { twoFactorRequired: true }
 *       { resend: true }   → { sent: true }
 *
 * The code expires in 10 minutes and allows 5 attempts. On success this
 * device becomes trusted (after the authenticator code, for 2FA accounts).
 */
export async function POST(request: Request) {
  try {
    const pending = await readPendingFaceEmailCookie()
    if (!pending) return NextResponse.json(EXPIRED, { status: 401 })

    const ipKey = clientLimiterKeyFromRequest(request, null)
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
    const limit = await rateLimitRedis(`face-email-code:verify:${pending.uid}`, 10, 10 * 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: limit.retryAfterSec } }, { status: 429 })
    }

    const body = (await request.json().catch(() => ({}))) as { code?: unknown; resend?: unknown }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ $or: [{ id: pending.uid }, { _id: pending.uid as never }] })
    if (!user || accountBlockReason(user) || !faceSignInAllowed(user)) {
      await clearPendingFaceEmailCookie()
      return NextResponse.json(EXPIRED, { status: 401 })
    }

    if (body.resend === true) {
      const issued = await issueFaceEmailCode(pending.uid, pending.email)
      if (!issued.ok) {
        return issued.reason === 'rate_limited'
          ? NextResponse.json({ error: `We’ve sent several codes already. Try again in ${issued.retryAfterSec ?? 600}s.`, code: 'auth_codes_limit', params: { seconds: issued.retryAfterSec ?? 600 } }, { status: 429 })
          : NextResponse.json({ error: 'We couldn’t send a new code. Try again in a minute.', code: 'auth_code_resend_failed' }, { status: 503 })
      }
      await setPendingFaceEmailCookie({ ...pending, challengeId: issued.challengeId })
      return NextResponse.json({ sent: true })
    }

    const result = await verifyFaceEmailCode(pending.challengeId, pending.uid, body.code)
    if (!result.ok) {
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'denied', actor: pending.email, actorIp: rawIp, resource: 'user/' + pending.uid, resourceType: 'auth', severity: 'warning', user_id: pending.uid, detail: `email code ${result.reason}` }).catch(() => {})
      if (result.reason === 'invalid') {
        return NextResponse.json({ error: 'That code is incorrect. Check the email and try again.', code: 'auth_code_incorrect_email' }, { status: 401 })
      }
      if (result.reason === 'too_many_attempts') {
        return NextResponse.json({ error: 'Too many wrong codes. Send a new code, or use your password.', code: 'auth_too_many_wrong_codes', resendable: true }, { status: 429 })
      }
      return NextResponse.json({ error: 'That code has expired. Send a new code to try again.', code: 'auth_code_expired', resendable: true }, { status: 401 })
    }

    await clearPendingFaceEmailCookie()
    const totpEnabled = !!(user.totp_enabled && user.totp_secret)
    const step = faceSignInNextStep({ trustedDevice: false, totpEnabled, emailCodeVerified: true })
    if (step === 'totp') {
      // The device is trusted once the authenticator code is in (two-factor route).
      await setPending2faCookie({ uid: pending.uid, email: pending.email, role: pending.role, method: 'face' })
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: pending.email, actorIp: rawIp, resource: 'user/' + pending.uid, resourceType: 'auth', severity: 'info', user_id: pending.uid, detail: 'email code verified; awaiting 2FA code' }).catch(() => {})
      return NextResponse.json({ twoFactorRequired: true })
    }

    const ua = request.headers.get('user-agent')
    await setSessionCookie({ uid: pending.uid, email: pending.email, role: pending.role })
    await trustCurrentDevice(pending.uid, ua)
    await writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: pending.email, actorIp: rawIp, resource: 'user/' + pending.uid, resourceType: 'auth', severity: 'info', user_id: pending.uid, detail: 'email code verified; signed in; device trusted' }).catch(() => {})
    createUserSession({ user_id: pending.uid, email: pending.email, ip: rawIp, user_agent: ua || 'Unknown device' }).catch(() => {})
    return NextResponse.json({ user: { id: pending.uid, email: pending.email, role: pending.role, name: user.name || null } })
  } catch (error) {
    console.error('[auth/face-email-code] Error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
