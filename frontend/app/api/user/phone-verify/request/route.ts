import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'phone_verify_otps'
const TTL_MS = 15 * 60 * 1000

/**
 * POST — start phone verification.
 * Free path: email OTP to the user's current login email (SMS gateways are paid).
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  if (!user.email) {
    return NextResponse.json({ error: 'Add a login email before verifying phone' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/\D/g, '')
  const countryCode = String(body.countryCode || '+91').trim()
  // SEC-014: validated before it is stored or echoed into the email HTML.
  if (!/^\+\d{1,4}$/.test(countryCode)) {
    return NextResponse.json({ error: 'Choose a valid country code', code: 'country_code_invalid' }, { status: 400 })
  }
  if (phone.length < 6 || phone.length > 15) {
    return NextResponse.json({ error: 'Enter a valid mobile number', code: 'phone_invalid' }, { status: 400 })
  }
  const { rateLimitRedis } = await import('@/lib/upstash-rate-limit')
  const limit = await rateLimitRedis(`phone-verify:${user.id}`, 5, 3600_000)
  if (!limit.ok) {
    return NextResponse.json({ error: `Too many requests. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`, code: 'rate_limited_minutes', params: { minutes: Math.ceil(limit.retryAfterSec / 60) } }, { status: 429 })
  }

  const code = String(randomInt(100000, 999999))
  const db = await getMongoDb()
  await db.collection(COL).updateOne(
    { userId: user.id },
    {
      $set: {
        userId: user.id,
        phone,
        countryCode,
        code,
        attempts: 0,
        expiresAt: new Date(Date.now() + TTL_MS),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  )

  await sendEmail(user.email, {
    subject: 'Confirm your mobile number on CodeSpectra',
    html: `<p>Save mobile <strong>${countryCode} ${phone}</strong> to your profile.</p><p>Your code is <strong>${code}</strong> (expires in 15 minutes).</p><p>This confirms the change came from you; the number itself is marked verified only once SMS verification is available.</p>`,
  }, undefined, { category: 'transactional' })

  return NextResponse.json({
    ok: true,
    message: 'Confirmation code sent to your login email',
  })
}
