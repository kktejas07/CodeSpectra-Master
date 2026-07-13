import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = rateLimitSlidingWindow(`verify-email:ip:${ipKey}`, 3, 60_000)
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

  const domain = email.split('@')[1]
  if (!domain || !domain.includes('.')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ email })

  if (!user) return NextResponse.json({ success: true })

  if (user.emailVerified) {
    return NextResponse.json({ error: 'Email already verified' }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

  await db.collection('user').updateOne(
    { email },
    { $set: { verification_token_hash: hashedToken, verification_sent_at: new Date().toISOString() } },
  )

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verifyLink = `${origin}/api/auth/verify-email?token=${token}`

  const template = emailTemplates.emailVerification(verifyLink)
  await sendEmail(email, template)

  return NextResponse.json({ success: true })
}
