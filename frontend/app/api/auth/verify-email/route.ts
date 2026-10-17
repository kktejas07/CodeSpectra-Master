import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || ''

  if (!token || token.length < 16) {
    return redirectWithMessage('Invalid verification link')
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
  const db = await getMongoDb()
  const user = await db.collection('user').findOne({
    verification_token_hash: hashedToken,
  })

  if (!user) {
    return redirectWithMessage('Invalid or expired verification link')
  }

  if (user.emailVerified) {
    return redirectWithMessage('Email already verified')
  }

  if (
    user.verification_token_expires &&
    new Date(user.verification_token_expires).getTime() < Date.now()
  ) {
    return redirectWithMessage('Invalid or expired verification link')
  }

  await db.collection('user').updateOne(
    { email: user.email },
    {
      $set: { emailVerified: true, email_verified_at: new Date().toISOString() },
      $unset: { verification_token_hash: '', verification_token_expires: '' },
    },
  )

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${origin}/auth/login?verified=true`)
}

function redirectWithMessage(msg: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${origin}/auth/login?verify_error=${encodeURIComponent(msg)}`)
}

/**
 * POST /api/auth/verify-email — resend the verification link to the
 * signed-in user (rate limited; no-op when already verified).
 */
export async function POST() {
  const { getAPIUser } = await import('@/lib/route-auth')
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const limit = await rateLimitRedis(`verify-email:resend:${user.id}`, 3, 3600_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` }, { status: 429 })
  }

  const db = await getMongoDb()
  const doc = await db.collection('user').findOne({ $or: [{ id: user.id }, { _id: user.id as never }] }, { projection: { _id: 1, email: 1, emailVerified: 1 } })
  if (!doc?.email) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  if (doc.emailVerified !== false) return NextResponse.json({ ok: true, alreadyVerified: true })

  const token = crypto.randomBytes(32).toString('hex')
  await db.collection('user').updateOne(
    { _id: doc._id },
    {
      $set: {
        verification_token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        verification_token_expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    },
  )
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const { sendEmail } = await import('@/lib/send-email')
  const { emailTemplates } = await import('@/lib/email-templates')
  try {
    await sendEmail(String(doc.email), emailTemplates.emailVerification(`${origin}/api/auth/verify-email?token=${token}`))
  } catch (e) {
    console.error('[verify-email] resend failed:', e)
    return NextResponse.json({ error: 'We couldn’t send the email. Try again later.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
