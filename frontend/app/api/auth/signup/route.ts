import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { passwordProblem } from '@/lib/auth-account'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { createUserSession } from '@/lib/db/sessions'
import { isIpBlocked, trackDeviceFingerprint, recordSecurityEvent, isIpOutsideWhitelist } from '@/lib/db/security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')

    // Peek at the body early: a VALID assessment invite exempts this signup
    // from the per-IP throttle. Bulk-invited candidates (college labs, shared
    // NAT) would otherwise trip the 3/hour/IP bot guard on the 4th signup.
    // The token must exist, match this email, and be unused — a forged or
    // spent token falls straight back through to the throttle below.
    let invitedBypass = false
    let previewBody: Record<string, unknown> = {}
    try {
      previewBody = await request.clone().json()
    } catch {
      previewBody = {}
    }
    const previewToken = typeof previewBody.inviteToken === 'string' ? previewBody.inviteToken.trim() : ''
    const previewEmail = typeof previewBody.email === 'string' ? previewBody.email.toLowerCase().trim() : ''
    if (previewToken && previewEmail) {
      try {
        const db = await getMongoDb()
        const inv = await db.collection('candidate_invites').findOne({ token: previewToken })
        if (
          inv &&
          String(inv.email || '').toLowerCase() === previewEmail &&
          (inv.status === 'pending' || inv.status === 'active')
        ) {
          invitedBypass = true
        }
      } catch {
        invitedBypass = false
      }
    }

    if (!invitedBypass) {
      const ipCheck = await rateLimitRedis(`signup:ip:${ipKey}`, 3, 3600_000)
      if (!ipCheck.ok) {
        return NextResponse.json(
          { error: `Too many accounts created from this location. Try again later.` },
          { status: 429 },
        )
      }
    } else {
      await writeAuditLog({ action: 'auth.signup', outcome: 'success', actor: previewEmail, actorIp: rawIp, resource: 'auth/signup', resourceType: 'auth', severity: 'info', detail: 'IP throttle bypassed via valid assessment invite', user_id: previewEmail })
    }

    if (await isIpBlocked(rawIp)) {
      await recordSecurityEvent({
        type: 'auth.blocked_ip',
        severity: 'critical',
        ip: rawIp,
        detail: 'Blocked IP attempted to create an account',
        metadata: { userAgent: request.headers.get('user-agent') },
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (await isIpOutsideWhitelist(rawIp)) {
      await recordSecurityEvent({
        type: 'auth.blocked_ip',
        severity: 'warning',
        ip: rawIp,
        detail: 'Signup blocked — IP outside configured whitelist',
        metadata: { userAgent: request.headers.get('user-agent') },
      })
      return NextResponse.json({ error: 'Access denied from this location' }, { status: 403 })
    }

    // Admin switches: registrations closed / maintenance (A-025). A candidate
    // with a valid assessment invite may still create their account.
    const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
    const { registrationBlock } = await import('@/lib/auth-policy')
    const policy = await getGeneralSettingsCached()
    const closed = registrationBlock(policy, { invited: invitedBypass })
    if (closed) return NextResponse.json({ error: closed.error, code: closed.code }, { status: closed.status })

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
    // Whitelisted, size-capped profile fields only.
    const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
    const email = typeof raw.email === 'string' ? raw.email : ''
    const password = typeof raw.password === 'string' ? raw.password : ''
    const name = str(raw.name, 120)
    const visitorId = str(raw.visitorId, 200)
    const mobile = str(raw.mobile, 32)
    const userType = str(raw.userType, 40)
    const domain = str(raw.domain, 120)
    const experience = str(raw.experience, 40)
    const classGrade = str(raw.classGrade, 40)
    const currentJobRole = str(raw.currentJobRole, 120)
    const organisationName = str(raw.organisationName, 160)
    const organisationType = str(raw.organisationType, 60)
    const gradYearNum = Number(raw.graduationYear)
    const graduationYear = Number.isInteger(gradYearNum) && gradYearNum >= 1950 && gradYearNum <= 2100 ? gradYearNum : null
    const turnstileToken = typeof raw.turnstileToken === 'string' ? raw.turnstileToken : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    }
    const pwProblem = passwordProblem(password)
    if (pwProblem) {
      return NextResponse.json({ error: pwProblem }, { status: 400 })
    }

    // Cloudflare Turnstile verification (fail-closed when configured)
    const { verifyTurnstileToken, isCaptchaConfigured } = await import('@/lib/captcha/turnstile')
    if (await isCaptchaConfigured()) {
      if (!turnstileToken) {
        await writeAuditLog({ action: 'auth.signup', outcome: 'denied', actor: email?.toLowerCase(), actorIp: rawIp, resource: 'auth/signup', resourceType: 'auth', severity: 'warning', detail: 'Missing captcha token', user_id: email?.toLowerCase() || '' })
        return NextResponse.json({ error: 'Captcha verification required' }, { status: 403 })
      }
      const captchaResult = await verifyTurnstileToken(turnstileToken, rawIp)
      if (!captchaResult.ok) {
        await writeAuditLog({ action: 'auth.signup', outcome: 'denied', actor: email?.toLowerCase(), actorIp: rawIp, resource: 'auth/signup', resourceType: 'auth', severity: 'warning', detail: `Captcha failed: ${captchaResult.error || 'invalid token'}`, user_id: email?.toLowerCase() || '' })
        return NextResponse.json({ error: 'Captcha verification failed' }, { status: 403 })
      }
      await writeAuditLog({ action: 'auth.captcha', outcome: 'success', actor: email?.toLowerCase(), actorIp: rawIp, resource: 'auth/signup', resourceType: 'auth', severity: 'info', detail: 'Turnstile verified on signup', user_id: email?.toLowerCase() || '' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const actorIp = rawIp
    const db = await getMongoDb()
    const existing = await db.collection('user').findOne({ email: normalizedEmail })
    if (existing) {
      await writeAuditLog({ action: 'auth.signup', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'email already registered', user_id: normalizedEmail })
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const uid = randomUUID()
    const now = new Date()

    // Email-verification token (mirrors forgot-password: raw token emailed, sha256 hash stored)
    const verifyToken = crypto.randomBytes(32).toString('hex')
    const verifyTokenHash = crypto.createHash('sha256').update(verifyToken).digest('hex')
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await db.collection('user').insertOne({
      _id: uid,
      id: uid,
      email: normalizedEmail,
      name: name || null,
      mobile: mobile || null,
      userType: userType || null,
      domain: domain || null,
      experience: experience || null,
      classGrade: classGrade || null,
      currentJobRole: currentJobRole || null,
      organisationName: organisationName || null,
      organisationType: organisationType || null,
      graduationYear,
      passwordHash,
      role: 'user',
      emailVerified: false,
      // SEC-006: marks accounts created under the verify-first rule (legacy
      // accounts without it are grandfathered by lib/auth-policy signInBlock).
      email_verification_required: policy.require_email_verification === true,
      session_version: 1,
      verification_token_hash: verifyTokenHash,
      verification_token_expires: verifyTokenExpires,
      createdAt: now,
      updatedAt: now,
    } as any)

    // SEC-013: every email signup fires user.created (welcome/onboarding flows),
    // only after the account really exists. Idempotent per user id.
    void import('@/lib/automation/events')
      .then(({ emit }) => emit('user.created', { user_id: uid, email: normalizedEmail, name: name || null, method: 'email', email_verified: false, created_at: now.toISOString() }, { idempotencyKey: `user.created:${uid}` }))
      .catch((e) => console.error('[automation] emit failed:', (e as Error)?.message))

    // Invites sent before this account existed carry no user_id — attach them.
    await db.collection('candidate_invites').updateMany(
      { email: normalizedEmail, $or: [{ user_id: null }, { user_id: '' }, { user_id: { $exists: false } }] },
      { $set: { user_id: uid } },
    ).catch(() => {})

    const role = normalizeUserRole('user')
    // With "Require email verification" on, no session until the link is clicked.
    const verificationRequired = policy.require_email_verification === true
    if (!verificationRequired) await setSessionCookie({ uid, email: normalizedEmail, role })

    await writeAuditLog({ action: 'auth.signup', outcome: 'success', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid })

    const userAgent = request.headers.get('user-agent') || 'Unknown device'
    createUserSession({ user_id: uid, email: normalizedEmail, ip: actorIp, user_agent: userAgent, visitor_id: visitorId || undefined }).catch(() => {})

    // Device fingerprint — detect same device creating multiple accounts (multi-account abuse).
    if (visitorId) {
      const fp = await trackDeviceFingerprint({ visitorId, user_id: uid, email: normalizedEmail, ip: actorIp, user_agent: userAgent })
      if (fp.multiAccountRisk) {
        await recordSecurityEvent({
          type: 'auth.multi_account',
          severity: 'critical',
          user_id: uid,
          email: normalizedEmail,
          ip: actorIp,
          visitorId,
          detail: 'New account created from a device already used by other accounts',
          metadata: { userAgent },
        })
      }
    }

    // CORE-005: a referral code sent with the sign-up is recorded now (pending until the account
    // is verified and completes a first graded activity) — with email verification on, the
    // browser has no session to apply it afterwards.
    if (typeof raw.referral_code === 'string' && raw.referral_code) {
      const { recordReferralRedemption } = await import('@/lib/referral-service')
      await recordReferralRedemption(db, { id: uid, email: normalizedEmail }, raw.referral_code)
        .catch((e) => console.error('[Signup] referral not recorded:', (e as Error)?.message))
    }

    // Send welcome email
    const displayName = name || normalizedEmail.split('@')[0]
    const template = emailTemplates.welcomeEmail(displayName)
    await sendEmail(normalizedEmail, template).catch((e) => console.error('[Signup] Welcome email failed:', e))

    // Send verification email — the link hits GET /api/auth/verify-email?token=
    // (sha256-hashed there and matched against verification_token_hash).
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyLink = `${origin}/api/auth/verify-email?token=${verifyToken}`
    await sendEmail(normalizedEmail, emailTemplates.emailVerification(verifyLink)).catch((e) => console.error('[Signup] Verification email failed:', e))

    return NextResponse.json({
      user: { id: uid, email: normalizedEmail, role, name: name || null },
      ...(verificationRequired ? { verificationRequired: true } : {}),
    })
  } catch (error) {
    console.error('[Signup] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
