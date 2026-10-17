import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { writeAuditLog } from '@/lib/db/misc'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { setPending2faCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { accountBlockReason } from '@/lib/auth-account'
import { checkAuthThrottle, recordAuthFailure } from '@/lib/auth-throttle'
import { isIpBlocked, isIpOutsideWhitelist } from '@/lib/db/security'

export const dynamic = 'force-dynamic'

const GENERIC_FAIL = 'Face sign-in failed. Use your password instead.'

function cosineSimilarity(A: number[], B: number[]) {
  if (A.length !== B.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < A.length; i++) {
    dot += A[i] * B[i]
    normA += A[i] * A[i]
    normB += B[i] * B[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function isDescriptor(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 128 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10)
}

/**
 * POST /api/auth/face-verify — face as a FIRST factor that never signs
 * anyone in on its own.
 *
 * The descriptor is computed in the browser, so the server can't prove it
 * came from a live camera (a public photo of the person produces the same
 * vector). Face sign-in therefore only parks the user in the 5-minute
 * pending-2FA cookie; the session is issued by POST /api/auth/two-factor
 * after a valid authenticator code. Accounts without 2FA can't use it.
 * The descriptor is compared against the template enrolled server-side,
 * with per-account+IP back-off and a per-account hourly cap.
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

    const body = (await request.json().catch(() => ({}))) as { email?: unknown; descriptor?: unknown }
    const normalizedEmail = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    if (!normalizedEmail || !isDescriptor(body.descriptor)) {
      return NextResponse.json({ error: 'Email and a face scan are required' }, { status: 400 })
    }
    const descriptor = body.descriptor

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
    const template = user?.facial_biometric_template
    if (!user || accountBlockReason(user) || !isDescriptor(template)) {
      await recordAuthFailure('face', normalizedEmail, rawIp)
      return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    }

    const uid = String(user.id || user._id)
    const similarityScore = cosineSimilarity(descriptor, template)
    // Threshold > 0.85 indicates a very strong match for 128d embeddings (face-api.js)
    if (similarityScore < 0.85) {
      await recordAuthFailure('face', normalizedEmail, rawIp)
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'denied', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'warning', user_id: uid, detail: `Biometric login failed. Score: ${similarityScore.toFixed(3)}` }).catch(() => {})
      return NextResponse.json({ error: GENERIC_FAIL }, { status: 401 })
    }

    if (!user.totp_enabled || !user.totp_secret) {
      await writeAuditLog({ action: 'auth.biometric_login', outcome: 'denied', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid, detail: 'face matched but 2FA is off — face alone never signs in' }).catch(() => {})
      return NextResponse.json(
        { error: 'Face sign-in needs two-step verification. Sign in with your password, then turn on two-step verification in your profile.', code: 'two_factor_required_for_face' },
        { status: 403 },
      )
    }

    const role = normalizeUserRole(user.role)
    await setPending2faCookie({ uid, email: normalizedEmail, role, method: 'face' })
    await writeAuditLog({ action: 'auth.biometric_login', outcome: 'success', actor: normalizedEmail, actorIp: rawIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid, detail: 'face matched; awaiting 2FA code' }).catch(() => {})
    return NextResponse.json({ twoFactorRequired: true })
  } catch (error) {
    console.error('[FaceVerify] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
