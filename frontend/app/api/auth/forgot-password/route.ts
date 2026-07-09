import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { sendEmail } from '@/lib/email-templates'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = rateLimitSlidingWindow(`forgot-pw:ip:${ipKey}`, 3, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  let email = ''
  try {
    const body = await request.json()
    email = String(body.email || '').toLowerCase().trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ email })

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ success: true })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await db.collection('user').updateOne(
    { email },
    {
      $set: {
        reset_token_hash: hashedToken,
        reset_token_expires: expiresAt,
        reset_token_used: false,
      },
    },
  )

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetLink = `${origin}/auth/reset-password?oobCode=${token}`

  await sendEmail(email, {
    subject: 'Reset your CodeSpectra password',
    html: `<div style="max-width:480px;margin:40px auto;font-family:system-ui,sans-serif">
      <h1 style="font-size:22px;font-weight:700">Password Reset</h1>
      <p style="color:#4b5563">Click the button below to reset your CodeSpectra password. This link expires in 1 hour.</p>
      <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
      <p style="color:#9ca3af;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`,
  })

  return NextResponse.json({ success: true })
}
