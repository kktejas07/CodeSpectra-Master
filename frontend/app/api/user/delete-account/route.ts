import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { clearSessionCookie, revokeAllUserSessions } from '@/lib/session'
import { verifyReauth } from '@/lib/reauth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { writeAuditLog } from '@/lib/db/misc'
import { getAdminAuthInstance } from '@/lib/firebase-admin'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'

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
  // Skill passport + talent-search opt-in and the invites sent to this learner.
  { collection: 'skill_passports', field: 'user_id' },
  { collection: 'talent_invites', field: 'learner_id' },
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

    // SEC-011: password, else authenticator code, else a REAL sign-in within
    // 15 minutes (reauth_at — never refreshed by a session alone).
    const reauth = await verifyReauth(user as never, { password, code })
    if (!reauth.ok) return NextResponse.json({ error: reauth.error, needs: reauth.needs }, { status: reauth.status })

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
    await import('@/lib/agent/schedule-guard').then((m) => m.disableSchedulesCreatedBy(uid)).catch(() => 0)

    await Promise.allSettled(CASCADE.map(({ collection, field }) => db.collection(collection).deleteMany({ [field]: uid })))
    // SEC-027: ID photos, selfies and KYC records go with the account.
    const { purgeUserIdentityData } = await import('@/lib/identity-media')
    await purgeUserIdentityData(uid).catch((e) => console.error('[DeleteAccount] identity purge failed:', (e as Error)?.message))
    // Candidate invites keep the invite history but drop the link to the account.
    await db.collection('candidate_invites').updateMany({ user_id: uid }, { $set: { user_id: null } }).catch(() => {})
    // RAG-004: the person's résumé / attempt summaries leave the knowledge index everywhere.
    await import('@/lib/rag/hooks').then((h) => h.knowledgeOnUserDeleted(uid)).catch(() => {})

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
