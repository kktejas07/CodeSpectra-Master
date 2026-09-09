import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
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
    const ipCheck = await rateLimitRedis(`signup:ip:${ipKey}`, 3, 3600_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many accounts created from this location. Try again later.` },
        { status: 429 },
      )
    }

    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
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

    const { email, password, name, visitorId, mobile, userType, domain, experience, classGrade, currentJobRole, organisationName, organisationType, turnstileToken } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
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
      passwordHash,
      role: 'user',
      emailVerified: false,
      session_version: 1,
      verification_token_hash: verifyTokenHash,
      verification_token_expires: verifyTokenExpires,
      createdAt: now,
      updatedAt: now,
    } as any)

    const role = normalizeUserRole('user')
    await setSessionCookie({ uid, email: normalizedEmail, role })

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

    // Send welcome email
    const displayName = name || normalizedEmail.split('@')[0]
    const template = emailTemplates.welcomeEmail(displayName)
    await sendEmail(normalizedEmail, template).catch((e) => console.error('[Signup] Welcome email failed:', e))

    // Send verification email — the link hits GET /api/auth/verify-email?token=
    // (sha256-hashed there and matched against verification_token_hash).
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const verifyLink = `${origin}/api/auth/verify-email?token=${verifyToken}`
    await sendEmail(normalizedEmail, emailTemplates.emailVerification(verifyLink)).catch((e) => console.error('[Signup] Verification email failed:', e))

    return NextResponse.json({ user: { id: uid, email: normalizedEmail, role, name: name || null } })
  } catch (error) {
    console.error('[Signup] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
