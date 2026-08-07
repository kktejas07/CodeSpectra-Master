import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { notify } from '@/lib/notifications'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { updateUserLastLogin } from '@/lib/db/admin'
import { createUserSession } from '@/lib/db/sessions'
import { isIpBlocked, blockIp, trackDeviceFingerprint, detectImpossibleTravel, recordSecurityEvent, isIpOutsideWhitelist, securityPolicy } from '@/lib/db/security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const ipKey = clientLimiterKeyFromRequest(request, null)
    const ipCheck = rateLimitSlidingWindow(`login:ip:${ipKey}`, 10, 60_000)
    if (!ipCheck.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.` },
        { status: 429 },
      )
    }

    // Blocked IP fast-path — refuse before touching the DB.
    const rawIp = ipKey.replace(/^(ip:|u:)/, '')
    if (await isIpBlocked(rawIp)) {
      await recordSecurityEvent({
        type: 'auth.blocked_ip',
        severity: 'critical',
        ip: rawIp,
        detail: 'Blocked IP attempted to sign in',
        metadata: { userAgent: request.headers.get('user-agent') },
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // IP Whitelist enforcement (when enabled by superadmin)
    if (await isIpOutsideWhitelist(rawIp)) {
      await recordSecurityEvent({
        type: 'auth.blocked_ip',
        severity: 'warning',
        ip: rawIp,
        detail: 'Login blocked — IP outside configured whitelist',
        metadata: { userAgent: request.headers.get('user-agent') },
      })
      return NextResponse.json({ error: 'Access denied from this location' }, { status: 403 })
    }

    const { email, password, totpToken, visitorId } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const actorIp = rawIp
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ email: normalizedEmail })
    if (!user) {
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'user not found', user_id: normalizedEmail })
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.passwordHash) {
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'no password set (OAuth account)', user_id: normalizedEmail })
      return NextResponse.json(
        { error: 'This account does not have a password set. Sign in with Google/GitHub or reset your password.' },
        { status: 400 },
      )
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      const emailCheck = rateLimitSlidingWindow(`login:email:${normalizedEmail}`, 5, 60_000)
      if (!emailCheck.ok) {
        await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'rate limited', user_id: normalizedEmail })
        return NextResponse.json(
          { error: `Too many attempts. Try again in ${emailCheck.retryAfterSec}s.` },
          { status: 429 },
        )
      }
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'info', detail: 'wrong password', user_id: normalizedEmail })

      // Brute-force escalation: 3+ distinct failed attempts from one IP in 10 min → block the IP.
      const failWindow = rateLimitSlidingWindow(`login:fail:${rawIp}`, 3, 600_000)
      if (!failWindow.ok) {
        await blockIp({ ip: rawIp, reason: 'Brute-force: 3+ failed logins in 10 minutes', actor: 'system' })
        await recordSecurityEvent({
          type: 'auth.rate_limited',
          severity: 'critical',
          ip: rawIp,
          detail: 'IP auto-blocked after repeated failed logins',
        })
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const uid = user.id || user._id
    const role = normalizeUserRole(user.role as string | undefined | null)

    if (user.totp_enabled) {
      if (!totpToken) {
        return NextResponse.json({ twoFactorRequired: true, uid })
      }
      const { TOTP } = await import('otplib')
      const totp = new TOTP()
      const isValid = totp.verify({ token: totpToken, secret: user.totp_secret } as unknown as string)
      if (!isValid) {
        await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'warning', detail: 'invalid 2FA code', user_id: uid })
        return NextResponse.json({ error: 'Invalid two-factor code' }, { status: 401 })
      }
    }

    await setSessionCookie({ uid, email: user.email, role })
    await updateUserLastLogin(uid, 'email')

    await writeAuditLog({ action: 'auth.login', outcome: 'success', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid })
    notify({ user_id: uid, type: 'auth.login', title: 'New sign-in', message: `Signed in as ${user.email}`, icon: 'log-in' }).catch(() => {})

    const userAgent = request.headers.get('user-agent') || 'Unknown device'
    const sessionGeo = await createUserSession({ user_id: uid, email: user.email, ip: actorIp, user_agent: userAgent, visitor_id: visitorId || undefined })

    // Concurrent Session Limit — prune oldest sessions beyond the configured cap.
    const policy = await securityPolicy()
    if (policy.concurrentSessionLimit > 0) {
      try {
        const db2 = await getMongoDb()
        const active = await db2.collection('user_sessions')
          .find({ user_id: uid, is_active: true })
          .sort({ last_seen: -1 })
          .toArray()
        const excess = active.slice(policy.concurrentSessionLimit)
        if (excess.length > 0) {
          await db2.collection('user_sessions').updateMany(
            { id: { $in: excess.map(s => s.id) } },
            { $set: { is_active: false } },
          )
        }
      } catch (e) {
        console.error('[Login] Concurrent session prune failed:', e)
      }
    }

    // Device fingerprint — detect new device + multi-account risk.
    if (visitorId) {
      const fp = await trackDeviceFingerprint({ visitorId, user_id: uid, email: user.email, ip: actorIp, user_agent: userAgent })
      if (fp.isNewDevice) {
        await recordSecurityEvent({
          type: 'auth.new_device',
          severity: 'info',
          user_id: uid,
          email: user.email,
          ip: actorIp,
          visitorId,
          detail: 'New device fingerprint used for this account',
          metadata: { userAgent },
        })
      }
      if (fp.multiAccountRisk) {
        await recordSecurityEvent({
          type: 'auth.multi_account',
          severity: 'warning',
          user_id: uid,
          email: user.email,
          ip: actorIp,
          visitorId,
          detail: 'Same device fingerprint used by multiple accounts',
          metadata: { userAgent },
        })
      }
    }

    // Impossible-travel check (account-takeover signal). Compare resolved geo from this
    // login against the user's most recent session.
    const travel = await detectImpossibleTravel({ user_id: uid, ip: actorIp, country: sessionGeo.country })
    if (travel) {
      await recordSecurityEvent({
        type: 'auth.impossible_travel',
        severity: 'critical',
        user_id: uid,
        email: user.email,
        ip: actorIp,
        visitorId: visitorId || undefined,
        detail: 'Login from a different country within 2h of previous login',
      })
    }

    // Send login notification email
    const deviceInfo = userAgent.includes('Mobile') ? 'Mobile device' : 'Desktop browser'
    const location = actorIp || 'Unknown location'
    const time = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    const displayName = (user.name || normalizedEmail.split('@')[0])
    const template = emailTemplates.loginNotification(displayName, deviceInfo, location, time)
    await sendEmail(normalizedEmail, template).catch((e) => console.error('[Login] Notification email failed:', e))

    return NextResponse.json({ user: { id: uid, email: user.email, role, name: user.name || null } })
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
