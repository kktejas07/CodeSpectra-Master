import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { updateUserById } from '@/lib/db/admin'
import { invalidateAuthProfile, readSessionCookie, revokeAllUserSessions, setSessionCookie } from '@/lib/session'
import { createHash, randomBytes } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'email_change_otps'

/** POST — confirm OTP and update the user's login email. */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const code = String(body.code || '').trim()
  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const row = await db.collection(COL).findOne({ userId: user.id, email })
  if (!row) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }
  // 5 tries per code, then it's burned (a 6-digit code is otherwise guessable).
  if ((Number(row.attempts) || 0) >= 5) {
    await db.collection(COL).deleteOne({ userId: user.id })
  invalidateAuthProfile(user.id)
    return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 })
  }
  if (String(row.code) !== code) {
    await db.collection(COL).updateOne({ userId: user.id }, { $inc: { attempts: 1 } })
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 })
  }

  const taken = await db.collection('user').findOne({ email })
  if (taken && String((taken as any).id || (taken as any)._id) !== user.id) {
    return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
  }

  await db.collection('user').updateOne(
    { $or: [{ id: user.id }, { _id: user.id as any }] },
    { $set: { email, emailVerified: true, updatedAt: new Date() } },
  )
  // Also try Better Auth helper path when present
  try {
    await updateUserById(user.id, { email } as any)
  } catch { /* optional */ }

  await db.collection(COL).deleteOne({ userId: user.id })
  invalidateAuthProfile(user.id)

  // SEC-008: sign out every other session (this one is re-issued) and tell the
  // OLD address, with a 7-day link that puts the old email back.
  const hadCookie = !!(await readSessionCookie())
  await revokeAllUserSessions(user.id).catch(() => {})
  if (hadCookie) await setSessionCookie({ uid: user.id, email, role: user.role })

  const oldEmail = String(user.email || '').toLowerCase()
  if (oldEmail && oldEmail !== email) {
    try {
      const undo = randomBytes(32).toString('hex')
      await db.collection('email_change_undo').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'email_change_undo_ttl' }).catch(() => {})
      await db.collection('email_change_undo').insertOne({
        token_hash: createHash('sha256').update(undo).digest('hex'),
        user_id: user.id,
        old_email: oldEmail,
        new_email: email,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 86_400_000),
      })
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
      const { sendEmail } = await import('@/lib/send-email')
      await sendEmail(oldEmail, {
        subject: 'Your CodeSpectra sign-in email was changed',
        html:
          `<p>The sign-in email of your CodeSpectra account was just changed to <strong>${email.replace(/[<>&"]/g, '')}</strong>, and other sessions were signed out.</p>` +
          `<p>If this wasn't you, <a href="${origin}/api/user/email-change/undo?token=${undo}">put your old email back and secure the account</a> (link valid 7 days).</p>`,
      }, undefined, { category: 'transactional' })
    } catch (e) {
      console.error('[email-change] old-address notice failed:', (e as Error)?.message)
    }
  }

  return NextResponse.json({ ok: true, email })
}
