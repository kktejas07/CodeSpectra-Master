import { formatDateTime } from '@/lib/format-datetime'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { setSessionCookie } from '@/lib/session'
import { normalizeUserRole } from '@/lib/rbac'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { notify } from '@/lib/notifications'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'
import { updateUserLastLogin } from '@/lib/db/admin'
import { createUserSession } from '@/lib/db/sessions'
import { accountBlockReason } from '@/lib/auth-account'
import { trustCurrentDevice } from '@/lib/trusted-devices'
import { checkAuthThrottle, recordAuthFailure, clearAuthFailures } from '@/lib/auth-throttle'
import { isIpBlocked, blockIp, trackDeviceFingerprint, detectImpossibleTravel, recordSecurityEvent, isIpOutsideWhitelist, securityPolicy } from '@/lib/db/security'

export const runtime = 'nodejs'

/** Distinct accounts that must fail from one IP before it is auto-blocked. */
const AUTO_BLOCK_MIN_ACCOUNTS = 10

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

    const { email, password, totpToken, visitorId, turnstileToken } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const ident = String(email).toLowerCase().trim()
    const actorIp = rawIp

    // Turnstile bot check — enforced only when keys are configured (see
    // lib/captcha). Every attempt is tracked via security events + audit log.
    const { verifyTurnstileToken, isCaptchaConfigured } = await import('@/lib/captcha/turnstile')
    if (await isCaptchaConfigured()) {
      const captcha = await verifyTurnstileToken(
        typeof turnstileToken === 'string' ? turnstileToken : null,
        rawIp,
      )
      if (!captcha.ok) {
        await recordSecurityEvent({
          type: 'auth.captcha_failed',
          severity: 'warning',
          ip: rawIp,
          email: ident,
          detail: `Turnstile verification failed (${captcha.error || 'unknown'})`,
          metadata: { userAgent: request.headers.get('user-agent') },
        })
        return NextResponse.json({ error: 'Bot check failed. Please retry.' }, { status: 403 })
      }
      await writeAuditLog({
        action: 'auth.captcha', outcome: 'success', actor: ident, actorIp,
        resource: 'email/' + ident, resourceType: 'auth', severity: 'info',
        detail: 'turnstile passed', user_id: ident,
      })
    }
    // Per account+IP back-off (one user's typos never lock out a shared IP).
    const throttle = await checkAuthThrottle('login', ident, rawIp)
    if (!throttle.ok) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${throttle.retryAfterSec}s, or reset your password.` },
        { status: 429 },
      )
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
    const normalizedEmail = String(user?.email || ident).toLowerCase().trim()
    if (!user) {
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'user not found', user_id: normalizedEmail })
      await recordAuthFailure('login', ident, rawIp)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.passwordHash) {
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'no password set (OAuth account)', user_id: normalizedEmail })
      return NextResponse.json(
        { error: 'This account does not have a password set. Sign in with Google/GitHub or reset your password.' },
        { status: 400 },
      )
    }

    let valid = false
    try {
      valid = await bcrypt.compare(password, String(user.passwordHash))
    } catch {
      valid = false
    }
    if (!valid) {
      const emailCheck = await rateLimitRedis(`login:email:${normalizedEmail}`, 5, 60_000)
      if (!emailCheck.ok) {
        await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'warning', detail: 'rate limited', user_id: normalizedEmail })
        return NextResponse.json(
          { error: `Too many attempts. Try again in ${emailCheck.retryAfterSec}s.` },
          { status: 429 },
        )
      }
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'email/' + normalizedEmail, resourceType: 'auth', severity: 'info', detail: 'wrong password', user_id: normalizedEmail })
      await recordAuthFailure('login', ident, rawIp)

      // Brute-force escalation for spraying many accounts from one IP. The
      // threshold is high on purpose: campuses and offices share one NAT IP.
      // SEC-021: the IP is the real client (trusted-proxy aware), the
      // failures must span many different accounts (spraying, not one user's
      // typos), and private / proxy / unknown addresses are never blocked.
      const failWindow = await rateLimitRedis(`login:fail:${rawIp}`, 50, 600_000)
      if (!failWindow.ok) {
        const { isAutoBlockableIp } = await import('@/lib/client-ip')
        const { distinctFailedAccountsForIp } = await import('@/lib/auth-throttle')
        const accounts = isAutoBlockableIp(rawIp) ? await distinctFailedAccountsForIp('login', rawIp) : 0
        if (accounts >= AUTO_BLOCK_MIN_ACCOUNTS) {
          await blockIp({ ip: rawIp, reason: `Brute-force: 50+ failed logins across ${accounts} accounts in 10 minutes`, actor: 'system', expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() })
          await recordSecurityEvent({
            type: 'auth.rate_limited',
            severity: 'critical',
            ip: rawIp,
            detail: 'IP auto-blocked after failed logins across many accounts',
          })
        }
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const uid = String(user.id || user._id)
    const role = normalizeUserRole(user.role as string | undefined | null)

    // Deactivated accounts can't sign in (told only after a correct password).
    if (accountBlockReason(user)) {
      await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'warning', detail: 'account deactivated', user_id: uid })
      return NextResponse.json({ error: 'This account has been deactivated. Contact your administrator.' }, { status: 403 })
    }

    // Maintenance mode / required email verification (A-025, A-052).
    {
      const { getGeneralSettingsCached } = await import('@/lib/platform-general-settings-server')
      const { signInBlock } = await import('@/lib/auth-policy')
      const blocked = signInBlock(await getGeneralSettingsCached(), { role, emailVerified: user.emailVerified, email_verification_required: user.email_verification_required }, { method: 'password' })
      if (blocked) {
        await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', detail: blocked.code, user_id: uid })
        return NextResponse.json({ error: blocked.error, code: blocked.code }, { status: blocked.status })
      }
    }

    if (user.totp_enabled) {
      if (!totpToken) {
        return NextResponse.json({ twoFactorRequired: true })
      }
      // consumeTotp burns the code's time step so it can't be replayed (A-053).
      const { consumeTotp } = await import('@/lib/totp')
      const isValid = await consumeTotp(user, totpToken)
      if (!isValid) {
        await writeAuditLog({ action: 'auth.login', outcome: 'denied', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'warning', detail: 'invalid 2FA code', user_id: uid })
        await recordAuthFailure('login', ident, rawIp)
        return NextResponse.json({ error: 'Invalid two-factor code' }, { status: 401 })
      }
    }

    await clearAuthFailures('login', ident, rawIp)
    await setSessionCookie({ uid, email: user.email, role })
    // Password (+ authenticator code when on) passed: trust this browser for face sign-in.
    await trustCurrentDevice(uid, request.headers.get('user-agent'))
    await updateUserLastLogin(uid, 'email').catch((e) => console.error('[Login] updateUserLastLogin failed:', e))

    await writeAuditLog({ action: 'auth.login', outcome: 'success', actor: normalizedEmail, actorIp, resource: 'user/' + uid, resourceType: 'auth', severity: 'info', user_id: uid }).catch(() => {})
    notify({ user_id: uid, type: 'auth.login', title: 'New sign-in', message: `Signed in as ${user.email}`, icon: 'log-in' }).catch(() => {})

    // Fire-and-forget side effects — any failure here must NOT 500 the login
    Promise.allSettled([
      (async () => {
        const userAgent = request.headers.get('user-agent') || 'Unknown device'
        const sessionGeo = await createUserSession({ user_id: uid, email: user.email, ip: actorIp, user_agent: userAgent, visitor_id: visitorId || undefined })

        // Concurrent Session Limit — prune oldest sessions beyond the configured cap.
        try {
          const policy = await securityPolicy()
          if (policy.concurrentSessionLimit > 0) {
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
          }
        } catch (e) {
          console.error('[Login] Concurrent session prune failed:', e)
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

        // Impossible-travel check (account-takeover signal).
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
        const time = formatDateTime(new Date(), undefined, { dateStyle: 'medium', timeStyle: 'short' })
        const displayName = (user.name || normalizedEmail.split('@')[0])
        const template = emailTemplates.loginNotification(displayName, deviceInfo, location, time)
        await sendEmail(normalizedEmail, template).catch((e) => console.error('[Login] Notification email failed:', e))
      })(),
    ]).catch(() => {})

    return NextResponse.json({ user: { id: uid, email: user.email, role, name: user.name || null } })
  } catch (error) {
    console.error('[Login] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
