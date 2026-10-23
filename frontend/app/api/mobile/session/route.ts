/**
 * POST /api/mobile/session — biometric unlock for the Android app
 * (lib/mobile/unlock-tokens.ts; client: lib/native-bridge.ts).
 *
 *  { action: 'enroll', device_id }        signed in (cookie) → { token } once
 *  { action: 'unlock', device_id, token } → fresh session cookie + rotated { token }
 *  { action: 'revoke', device_id, token? } signed in, or holding the token
 *
 * The app only reads the token from Keystore storage after a successful
 * fingerprint / face check. Rate-limited per IP and per device; same account
 * checks as a session (active, session_version, admin 2FA rule).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAPIUser } from '@/lib/route-auth'
import { loadAuthProfile, readSessionCookie, setSessionCookie } from '@/lib/session'
import { accountBlockReason } from '@/lib/auth-account'
import { normalizeUserRole } from '@/lib/rbac'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientIpOrEmpty } from '@/lib/client-ip'
import { writeAuditLog } from '@/lib/db/misc'
import { decideUnlock, deleteUnlockToken, enrollUnlockToken, isDeviceId, isUnlockToken, redeemUnlockToken } from '@/lib/mobile/unlock-tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enroll'), device_id: z.string().refine(isDeviceId) }),
  z.object({ action: z.literal('unlock'), device_id: z.string().refine(isDeviceId), token: z.string().refine(isUnlockToken) }),
  z.object({ action: z.literal('revoke'), device_id: z.string().refine(isDeviceId), token: z.string().refine(isUnlockToken).optional() }),
])

const invalidToken = () => NextResponse.json({ error: 'Invalid token', code: 'auth_invalid_token' }, { status: 401 })
const limited = (seconds: number) =>
  NextResponse.json({ error: `Too many requests. Try again in ${seconds}s.`, code: 'rate_limited_seconds', params: { seconds } }, { status: 429 })

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null)
  if (raw === null) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  const parsed = Body.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const body = parsed.data
  const ip = clientIpOrEmpty(req)

  const ipLimit = await rateLimitRedis(`mobile-session:ip:${ip || 'none'}`, 20, 60_000)
  if (!ipLimit.ok) return limited(ipLimit.retryAfterSec)
  const devLimit = await rateLimitRedis(`mobile-session:dev:${body.device_id}`, 10, 10 * 60_000)
  if (!devLimit.ok) return limited(devLimit.retryAfterSec)

  try {
    if (body.action === 'enroll') {
      const user = await getAPIUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
      // Only a real cookie session (not an impersonation) may mint a device credential.
      const session = await readSessionCookie()
      if (!session || session.uid !== user.id || session.imp) return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
      const token = await enrollUnlockToken(user.id, body.device_id, session.ver)
      await writeAuditLog({ action: 'auth.biometric_enroll', outcome: 'success', actor: user.email, actorIp: ip, resource: 'user/' + user.id, resourceType: 'auth', severity: 'info', user_id: user.id }).catch(() => {})
      return NextResponse.json({ token })
    }

    if (body.action === 'revoke') {
      const user = await getAPIUser()
      let removed = 0
      if (user) removed = await deleteUnlockToken({ userId: user.id, deviceId: body.device_id })
      else if (body.token) {
        const r = await redeemUnlockToken(body.token, body.device_id)
        if (r.ok) removed = await deleteUnlockToken({ token: body.token })
      } else return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
      return NextResponse.json({ ok: true, removed })
    }

    // unlock
    const r = await redeemUnlockToken(body.token, body.device_id)
    if (!r.ok) {
      if (r.reason === 'reused') {
        await writeAuditLog({ action: 'auth.biometric_unlock', outcome: 'denied', actor: 'device/' + body.device_id, actorIp: ip, resource: 'device/' + body.device_id, resourceType: 'auth', severity: 'warning', detail: 'rotated token replayed — device token revoked', user_id: 'device/' + body.device_id }).catch(() => {})
      }
      return invalidToken()
    }
    const profile = await loadAuthProfile(r.userId)
    if (!profile || accountBlockReason(profile)) {
      await deleteUnlockToken({ token: body.token })
      return invalidToken()
    }
    if (decideUnlock(r.doc, profile.session_version as number | undefined) !== 'ok') {
      await deleteUnlockToken({ token: body.token })
      return invalidToken()
    }
    const role = normalizeUserRole(profile.role as string | undefined | null)
    {
      // SEC-009 parity with /api/auth/mobile-token: an admin past the 2FA grace period can't skip it here.
      const { getAdmin2faState } = await import('@/lib/admin-2fa')
      const tfa = await getAdmin2faState(r.userId, role).catch(() => ({ status: 'ok' as const }))
      if (tfa.status === 'required') {
        return NextResponse.json(
          { error: 'Turn on two-factor authentication on the web (Account → Security) before signing in on mobile.', code: 'admin_2fa_required' },
          { status: 403 },
        )
      }
    }
    const next = await r.rotate()
    await setSessionCookie({ uid: r.userId, email: String(profile.email ?? ''), role, ver: r.doc.session_version })
    await writeAuditLog({ action: 'auth.login', outcome: 'success', actor: String(profile.email ?? r.userId), actorIp: ip, resource: 'user/' + r.userId, resourceType: 'auth', severity: 'info', detail: 'biometric unlock (Android app)', user_id: r.userId }).catch(() => {})
    return NextResponse.json({ token: next })
  } catch (e) {
    console.error('[mobile/session] failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
