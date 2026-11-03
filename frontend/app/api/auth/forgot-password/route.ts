import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { getMongoDb } from '@/lib/mongodb'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { sendEmail } from '@/lib/send-email'
import { emailTemplatesFor } from '@/lib/email-templates'
import { localeForRequester } from '@/lib/i18n/recipient'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ipKey = clientLimiterKeyFromRequest(request, null)
  const ipCheck = await rateLimitRedis(`forgot-pw:ip:${ipKey}`, 3, 60_000)
  if (!ipCheck.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${ipCheck.retryAfterSec}s.`, code: 'auth_too_many_attempts', params: { seconds: ipCheck.retryAfterSec } },
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
    return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: 'Email is required', code: 'auth_email_required' }, { status: 400 })
  }

  // Cloudflare Turnstile verification (fail-closed when configured)
  const { verifyTurnstileToken, isCaptchaConfigured } = await import('@/lib/captcha/turnstile')
  if (await isCaptchaConfigured()) {
    if (!turnstileToken) {
      return NextResponse.json({ error: 'Captcha verification required', code: 'auth_captcha_required' }, { status: 403 })
    }
    const captchaResult = await verifyTurnstileToken(turnstileToken)
    if (!captchaResult.ok) {
      return NextResponse.json({ error: 'Captcha verification failed', code: 'auth_captcha_failed' }, { status: 403 })
    }
  }

  // Short, non-reversible tag for diagnostics — the address itself never
  // reaches the logs.
  const tag = crypto.createHash('sha256').update(email).digest('hex').slice(0, 8)

  // Per-email cap so one inbox can't be flooded. The old response was a bare
  // { success: true } that sent NOTHING, so a user who never got the first
  // mail kept "sending" reset links that were silently dropped for an hour
  // (the "reset email never arrives" report, 2026-11-03). Still identical for
  // registered and unknown addresses: only the throttle state is revealed.
  const emailCheck = await rateLimitRedis(`forgot-pw:email:${email}`, 3, 3600_000)
  if (!emailCheck.ok) {
    console.info(`[forgot-password] outcome=throttled tag=${tag} retry_after=${emailCheck.retryAfterSec}`)
    return NextResponse.json({ success: true, throttled: true, retry_after: emailCheck.retryAfterSec })
  }

  const db = await getMongoDb()
  const user = await db.collection('user').findOne({ email })

  // Always return success to prevent email enumeration
  if (!user) {
    console.info(`[forgot-password] outcome=unknown_address tag=${tag}`)
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

  const template = emailTemplatesFor(await localeForRequester(email)).passwordReset(resetLink)
  // Same response whether or not the email exists or the send failed —
  // a 500 only for real accounts would reveal which emails are registered.
  try {
    const sent = await sendEmail(email, template)
    if (sent.success) console.info(`[forgot-password] outcome=sent tag=${tag}`)
    else if (sent.suppressed) console.warn(`[forgot-password] outcome=suppressed tag=${tag}`)
    else console.error(`[forgot-password] outcome=send_failed tag=${tag} error=${sent.error || 'unknown'}`)
  } catch (e) {
    console.error(`[forgot-password] outcome=send_failed tag=${tag}`, e)
  }

  return NextResponse.json({ success: true })
}
