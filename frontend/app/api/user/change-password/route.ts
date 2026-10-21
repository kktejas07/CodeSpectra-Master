import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/route-auth'
import { readSessionCookie, revokeAllUserSessions, setSessionCookie } from '@/lib/session'
import { passwordProblem } from '@/lib/auth-account'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = await rateLimitRedis(`change-pw:${gate.user.id}`, 3, 60_000)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${rateCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: rateCheck.retryAfterSec } },
      { status: 429 },
    )
  }

  try {
    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required', code: 'auth_passwords_required' }, { status: 400 })
    }
    const pwProblem = passwordProblem(newPassword)
    if (pwProblem) {
      return NextResponse.json({ error: pwProblem }, { status: 400 })
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'No password set on this account' }, { status: 400 })
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect', code: 'auth_current_password_incorrect' }, { status: 403 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $set: { passwordHash, updatedAt: new Date() } },
    )
    // Sign out every other session, then give this browser a fresh one so
    // the person who just changed the password stays signed in.
    const hadCookie = !!(await readSessionCookie())
    await revokeAllUserSessions(gate.user.id)
    if (hadCookie) await setSessionCookie({ uid: gate.user.id, email: gate.user.email, role: gate.user.role })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ChangePassword] Error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'internal_error' }, { status: 500 })
  }
}
