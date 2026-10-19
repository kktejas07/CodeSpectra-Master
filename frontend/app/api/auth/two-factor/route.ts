import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { clearPending2faCookie, readPending2faCookie, setSessionCookie } from '@/lib/session'
import { consumeTotp } from '@/lib/totp'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { createUserSession } from '@/lib/db/sessions'
import { updateUserLastLogin } from '@/lib/db/admin'
import { accountBlockReason } from '@/lib/auth-account'
import { trustCurrentDevice } from '@/lib/trusted-devices'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/two-factor — second step for sign-ins whose first factor
 * was not a password (face, SSO, Google/GitHub). Those routes park the user in a 5-minute
 * signed `codespectra_2fa_pending` cookie instead of issuing a session; this
 * route checks the TOTP code against that pending user and only then sets
 * the real session. Password login keeps its own in-request TOTP step.
 * Body: { totpToken: string } → { user, redirect? }
 */
export async function POST(request: Request) {
  try {
    const pending = await readPending2faCookie()
    if (!pending) {
      return NextResponse.json({ error: 'Your sign-in took too long. Start again.', expired: true }, { status: 401 })
    }

    const ipKey = clientLimiterKeyFromRequest(request, null)
    const limit = await rateLimitRedis(`login:2fa:${pending.uid}`, 5, 5 * 60_000)
    if (!limit.ok) {
      return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
    }

    const { totpToken } = (await request.json().catch(() => ({}))) as { totpToken?: unknown }
    if (typeof totpToken !== 'string' || !totpToken.trim()) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your authenticator app.' }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ $or: [{ id: pending.uid }, { _id: pending.uid as never }] })
    if (!user || accountBlockReason(user) || !user.totp_enabled || !user.totp_secret) {
      await clearPending2faCookie()
      return NextResponse.json({ error: 'Your sign-in couldn’t be completed. Start again.', expired: true }, { status: 401 })
    }

    const actorIp = ipKey.replace(/^(ip:|u:)/, '')
    if (!(await consumeTotp(user, totpToken))) {
      await writeAuditLog({ action: `auth.${pending.method}_login`, outcome: 'denied', actor: pending.email, actorIp, resource: 'user/' + pending.uid, resourceType: 'auth', severity: 'warning', detail: 'invalid 2FA code', user_id: pending.uid }).catch(() => {})
      return NextResponse.json({ error: 'That code is incorrect or has expired.' }, { status: 401 })
    }

    await clearPending2faCookie()
    await setSessionCookie({ uid: pending.uid, email: pending.email, role: pending.role })
    // Full sign-in done (first factor + authenticator code): trust this browser for face sign-in.
    await trustCurrentDevice(pending.uid, request.headers.get('user-agent'))
    if (pending.method === 'sso') await updateUserLastLogin(pending.uid, 'sso').catch(() => {})
    await writeAuditLog({ action: `auth.${pending.method}_login`, outcome: 'success', actor: pending.email, actorIp, resource: 'user/' + pending.uid, resourceType: 'auth', severity: 'info', detail: '2FA passed', user_id: pending.uid }).catch(() => {})
    createUserSession({ user_id: pending.uid, email: pending.email, ip: actorIp, user_agent: request.headers.get('user-agent') || 'Unknown device' }).catch(() => {})

    return NextResponse.json({
      user: { id: pending.uid, email: pending.email, role: pending.role, name: user.name || null },
      redirect: pending.redirect || null,
    })
  } catch (error) {
    console.error('[auth/two-factor] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
