/**
 * GET /api/user/email-change/undo?token=… — SEC-008 recovery link mailed to the
 * OLD address after a login-email change. Puts the old email back (if the new
 * one is still in place), signs out every session, turns off any authenticator
 * that may have been added, and sends the owner to reset the password.
 * Single use; the token is stored only as a sha256 hash.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { revokeAllUserSessions, invalidateAuthProfile } from '@/lib/session'
import { writeAuditLog } from '@/lib/db/misc'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function back(path: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(new URL(path, origin).toString(), { status: 302 })
}

export async function GET(req: NextRequest) {
  const limit = await rateLimitRedis(`email-change-undo:${clientLimiterKeyFromRequest(req, null)}`, 10, 3600_000)
  if (!limit.ok) return back('/auth/login?email_change=rate_limited')
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!/^[a-f0-9]{64}$/.test(token)) return back('/auth/login?email_change=invalid')

  const db = await getMongoDb()
  const row = await db.collection('email_change_undo').findOneAndDelete({
    token_hash: createHash('sha256').update(token).digest('hex'),
    expires_at: { $gt: new Date() },
  })
  if (!row) return back('/auth/login?email_change=invalid')

  const uid = String(row.user_id)
  const users = db.collection('user')
  const user = await users.findOne({ $or: [{ id: uid }, { _id: uid as never }] })
  if (!user) return back('/auth/login?email_change=invalid')

  const taken = await users.findOne({ email: row.old_email, _id: { $ne: user._id } } as never)
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (!taken && String(user.email || '').toLowerCase() === row.new_email) set.email = row.old_email
  await users.updateOne(
    { _id: user._id },
    { $set: { ...set, totp_enabled: false }, $unset: { totp_secret: '', totp_pending_secret: '' } },
  )
  await revokeAllUserSessions(uid).catch(() => {})
  invalidateAuthProfile(uid)
  await writeAuditLog({
    action: 'user.email_change.undo', outcome: 'success', actor: String(row.old_email), actorIp: clientLimiterKeyFromRequest(req, null).replace(/^ip:/, ''),
    resource: 'user/' + uid, resourceType: 'auth', severity: 'critical', user_id: uid,
    detail: set.email ? 'login email restored; sessions revoked; authenticator removed' : 'sessions revoked; authenticator removed (old email now used elsewhere)',
  }).catch(() => {})
  return back('/auth/forgot-password?email_change=undone')
}
