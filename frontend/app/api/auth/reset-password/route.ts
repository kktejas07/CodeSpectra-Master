import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { revokeAllUserSessions } from '@/lib/session'
import { passwordProblem } from '@/lib/auth-account'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = await rateLimitRedis(`reset-pw:ip:${ipKey}`, 5, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: ipCheck.retryAfterSec } },
      { status: 429 },
    )
  }

  let code = ''
  let newPassword = ''
  try {
    const body = await request.json()
    code = String(body.code || '').trim()
    newPassword = String(body.newPassword || '')
  } catch {
    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  }

  if (!code || !newPassword) {
    return NextResponse.json({ error: 'Code and new password are required', code: 'auth_reset_fields_required' }, { status: 400 })
  }

  const pwProblem = passwordProblem(newPassword)
  if (pwProblem) {
    return NextResponse.json({ error: pwProblem }, { status: 400 })
  }

  const hashedToken = crypto.createHash('sha256').update(code).digest('hex')
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({
    reset_token_hash: hashedToken,
    reset_token_used: { $ne: true },
    reset_token_expires: { $gt: new Date().toISOString() },
  })

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired reset code', code: 'auth_reset_code_invalid' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await db.collection('user').updateOne(
    { _id: user._id },
    {
      // A reset link proves inbox ownership, so the email counts as verified.
      $set: { passwordHash: passwordHash, reset_token_used: true, emailVerified: true, updated_at: new Date().toISOString() },
      $unset: { reset_token_hash: '', reset_token_expires: '' },
    },
  )
  await revokeAllUserSessions(String((user as { id?: unknown }).id ?? user._id))

  return NextResponse.json({ success: true })
}
