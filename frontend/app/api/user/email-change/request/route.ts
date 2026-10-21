import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { getUserById } from '@/lib/db/admin'
import { verifyReauth } from '@/lib/reauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'email_change_otps'
const TTL_MS = 15 * 60 * 1000

/**
 * POST — send OTP to the *new* email address before updating login email.
 * Body: { email, password? , code? } — SEC-008: re-authentication is required
 * (current password, else an authenticator code, else a sign-in within 15 min).
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@') || email === (user.email || '').toLowerCase()) {
    return NextResponse.json({ error: 'Enter a different valid email' }, { status: 400 })
  }

  const limit = await rateLimitRedis(`email-change:${user.id}`, 5, 3600_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`, code: 'rate_limited_minutes', params: { minutes: Math.ceil(limit.retryAfterSec / 60) } }, { status: 429 })
  }

  const full = await getUserById(user.id)
  if (!full) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const reauth = await verifyReauth(full as never, { password: body.password, code: body.code })
  if (!reauth.ok) return NextResponse.json({ error: reauth.error, needs: reauth.needs }, { status: reauth.status })

  const db = await getMongoDb()
  const taken = await db.collection('user').findOne({ email })
  if (taken) {
    return NextResponse.json({ error: 'That email is already in use' }, { status: 409 })
  }

  const code = String(randomInt(100000, 999999))
  const now = Date.now()
  await db.collection(COL).updateOne(
    { userId: user.id },
    {
      $set: {
        userId: user.id,
        email,
        code,
        attempts: 0,
        expiresAt: new Date(now + TTL_MS),
        createdAt: new Date(now),
      },
    },
    { upsert: true },
  )

  await sendEmail(email, {
    subject: 'Confirm your new CodeSpectra email',
    html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 15 minutes.</p>`,
  }, undefined, { category: 'transactional' })

  return NextResponse.json({ ok: true, message: 'Verification code sent to the new email' })
}
