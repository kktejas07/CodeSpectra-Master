import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = await rateLimitRedis(`forgot-pw:ip:${ipKey}`, 3, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.` },
      { status: 429 },
    )
  }

  let email = ''
  let turnstileToken = ''
  try {
    const body = await request.json()
    email = String(body.email || '').toLowerCase().trim()
    turnstileToken = String(body.turnstileToken || '')
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Cloudflare Turnstile verification (fail-closed when configured)
  const { verifyTurnstileToken, isCaptchaConfigured } = await import('@/lib/captcha/turnstile')
  if (await isCaptchaConfigured()) {
    if (!turnstileToken) {
      return NextResponse.json({ error: 'Captcha verification required' }, { status: 403 })
    }
    const captchaResult = await verifyTurnstileToken(turnstileToken)
    if (!captchaResult.ok) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 403 })
    }
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

  const template = emailTemplates.passwordReset(resetLink)
  await sendEmail(email, template)

  return NextResponse.json({ success: true })
}
