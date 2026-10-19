import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { clearSessionCookie, revokeAllUserSessions } from '@/lib/session'
import { consumeTotp } from '@/lib/totp'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'

const RECENT_SIGN_IN_MS = 15 * 60_000

/**
 * Personal data removed with the account. Assessment, hackathon and billing
 * records stay with the organisations / ledgers that own them.
 */
const CASCADE: Array<{ collection: string; field: string }> = [
  { collection: 'user_sessions', field: 'user_id' },
  { collection: 'notifications', field: 'user_id' },
  { collection: 'notification_preferences', field: 'user_id' },
  { collection: 'user_extended_profiles', field: 'userId' },
  { collection: 'email_change_otps', field: 'userId' },
  { collection: 'id_card_tokens', field: 'user_id' },
  { collection: 'user_ai_settings', field: 'user_id' },
  { collection: 'device_fingerprints', field: 'user_id' },
]

/**
 * POST /api/user/delete-account — permanently delete the signed-in account.
 * Body: { password } for password accounts; { code } (authenticator) for
 * accounts without a password; accounts with neither must have signed in
 * within the last 15 minutes. Every session is revoked first.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const limit = await rateLimitRedis(`delete-account:${gate.user.id}`, 5, 15 * 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` }, { status: 429 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { password?: unknown; code?: unknown }
    const password = typeof body.password === 'string' ? body.password : ''
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''

    const user = (await getUserById(gate.user.id)) as (Record<string, unknown> & { _id: unknown }) | null
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let reauthed = false
    if (typeof user.passwordHash === 'string' && user.passwordHash) {
      reauthed = !!password && (await bcrypt.compare(password, user.passwordHash))
      if (!reauthed) return NextResponse.json({ error: 'That password is incorrect.' }, { status: 403 })
    } else if (user.totp_enabled && typeof user.totp_secret === 'string') {
      reauthed = !!code && (await consumeTotp(user, code))
      if (!reauthed) return NextResponse.json({ error: 'Enter a current code from your authenticator app.', needs: 'code' }, { status: 403 })
    } else {
      const last = user.lastLoginAt ? new Date(user.lastLoginAt as string).getTime() : 0
      reauthed = Date.now() - last < RECENT_SIGN_IN_MS
      if (!reauthed) {
        return NextResponse.json(
          { error: 'For your security, sign out and sign in again, then delete your account within 15 minutes.', needs: 'recent_sign_in' },
          { status: 403 },
        )
      }
    }

    const db = await getMongoDb()
    if (user.role === 'superadmin') {
      const others = await db.collection('user').countDocuments({ role: 'superadmin', _id: { $ne: user._id } } as never)
      if (others === 0) {
        return NextResponse.json({ error: 'You are the only superadmin. Make someone else a superadmin first.' }, { status: 409 })
      }
    }

    const uid = String(user.id || user._id)
    // Kill every session (this device included) before the account disappears.
    await revokeAllUserSessions(uid)

    await Promise.allSettled(CASCADE.map(({ collection, field }) => db.collection(collection).deleteMany({ [field]: uid })))
    // Candidate invites keep the invite history but drop the link to the account.
    await db.collection('candidate_invites').updateMany({ user_id: uid }, { $set: { user_id: null } }).catch(() => {})

    await db.collection('user').deleteOne({ _id: user._id } as never)

    const adminAuth = await getAdminAuthInstance()
    if (adminAuth) {
      const ids = new Set([uid, user.firebase_uid].filter((x): x is string => typeof x === 'string' && !!x))
      for (const id of ids) await adminAuth.deleteUser(id).catch(() => {})
    }

    await writeAuditLog({
      action: 'user.delete_self', outcome: 'success', actor: gate.user.email, actorIp: clientLimiterKeyFromRequest(request, null).replace(/^(ip:|u:)/, ''), resource: 'user/' + uid,
      resourceType: 'user', severity: 'warning', user_id: uid, detail: 'account deleted by its owner',
    }).catch(() => {})

    await clearSessionCookie()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DeleteAccount] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
