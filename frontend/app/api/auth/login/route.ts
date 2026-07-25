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

    const { email, password, totpToken } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const actorIp = clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, '')
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

    // Send login notification email
    const userAgent = request.headers.get('user-agent') || 'Unknown device'
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
