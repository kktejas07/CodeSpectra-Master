import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { consumeTotp } from '@/lib/totp'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

/** Body: { password } or { code } (current 6-digit authenticator code). */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const rateCheck = await rateLimitRedis(`2fa:disable:${gate.user.id}`, 5, 60_000)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Too many attempts. Try again in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { password?: unknown; code?: unknown }
    const password = typeof body.password === 'string' ? body.password : ''
    const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : ''
    if (!password && !code) {
      return NextResponse.json(
        { error: 'Enter your current password or a code from your authenticator app to turn off 2FA.' },
        { status: 400 },
      )
    }

    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: gate.user.id })
    if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })

    let valid = false
    if (password && user.passwordHash) {
      valid = await bcrypt.compare(password, user.passwordHash)
    } else if (code && user.totp_enabled && user.totp_secret) {
      valid = await consumeTotp(user, code)
    } else if (password && !user.passwordHash) {
      return NextResponse.json(
        { error: 'This account has no password. Use a code from your authenticator app instead.' },
        { status: 400 },
      )
    }
    if (!valid) {
      return NextResponse.json({ error: password ? 'That password is incorrect.' : 'That code is incorrect or has expired.' }, { status: 403 })
    }

    await db.collection('user').updateOne(
      { id: gate.user.id },
      { $unset: { totp_secret: '', totp_pending_secret: '', totp_setup_at: '', totp_verified_at: '', totp_last_step: '' }, $set: { totp_enabled: false } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] 2FA disable error:', error)
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 })
  }
}
