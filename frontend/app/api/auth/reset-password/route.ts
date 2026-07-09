import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = rateLimitSlidingWindow(`reset-pw:ip:${ipKey}`, 5, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.` },
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
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!code || !newPassword) {
    return NextResponse.json({ error: 'Code and new password are required' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const hashedToken = crypto.createHash('sha256').update(code).digest('hex')
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({
    reset_token_hash: hashedToken,
    reset_token_used: { $ne: true },
    reset_token_expires: { $gt: new Date().toISOString() },
  })

  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired reset code' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)

  await db.collection('user').updateOne(
    { email: user.email },
    {
      $set: { password: passwordHash, reset_token_used: true, updated_at: new Date().toISOString() },
      $unset: { reset_token_hash: '', reset_token_expires: '' },
    },
  )

  return NextResponse.json({ success: true })
}
