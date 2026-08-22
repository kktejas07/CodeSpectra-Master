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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.email) {
    return NextResponse.json({ error: 'Add a login email before verifying phone' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/\D/g, '')
  const countryCode = String(body.countryCode || '+91')
  if (phone.length < 6) {
    return NextResponse.json({ error: 'Enter a valid mobile number' }, { status: 400 })
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
        expiresAt: new Date(Date.now() + TTL_MS),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  )

  await sendEmail(user.email, {
    subject: 'Confirm your mobile number on CodeSpectra',
    html: `<p>Confirm mobile <strong>${countryCode} ${phone}</strong>.</p><p>Your code is <strong>${code}</strong> (expires in 15 minutes).</p><p>SMS OTP will be available once an SMS provider is configured.</p>`,
  }, undefined, { category: 'transactional' })

  return NextResponse.json({
    ok: true,
    message: 'Verification code sent to your login email (SMS coming later)',
  })
}
