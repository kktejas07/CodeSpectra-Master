import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'phone_verify_otps'

/**
 * POST — confirm the emailed code and SAVE the phone number.
 * SEC-014: the code went to the login email, so it proves the account owner
 * asked for the change — not that they own the number. The number is stored
 * with phoneVerified:false + phone_confirmed_via:'email' until an SMS/WhatsApp
 * OTP exists.
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const phone = String(body.phone || '').replace(/\D/g, '')
  const countryCode = String(body.countryCode || '+91').trim()
  const code = String(body.code || '').trim()
  if (!phone || !code) {
    return NextResponse.json({ error: 'Phone and code are required' }, { status: 400 })
  }
  if (!/^\+\d{1,4}$/.test(countryCode)) {
    return NextResponse.json({ error: 'Choose a valid country code', code: 'country_code_invalid' }, { status: 400 })
  }

  const db = await getMongoDb()
  const row = await db.collection(COL).findOne({ userId: user.id, phone })
  if (!row) return NextResponse.json({ error: 'Invalid verification code', code: 'auth_invalid_verification_code' }, { status: 400 })
  if ((Number(row.attempts) || 0) >= 5) {
    await db.collection(COL).deleteOne({ userId: user.id })
    return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 })
  }
  if (String(row.code) !== code) {
    await db.collection(COL).updateOne({ userId: user.id }, { $inc: { attempts: 1 } })
    return NextResponse.json({ error: 'Invalid verification code', code: 'auth_invalid_verification_code' }, { status: 400 })
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Code expired — request a new one', code: 'auth_code_expired_request' }, { status: 400 })
  }

  const now = new Date().toISOString()
  await db.collection('user').updateOne(
    { $or: [{ id: user.id }, { _id: user.id as any }] },
    {
      $set: {
        phone,
        countryCode,
        phoneVerified: false,
        phone_confirmed_via: 'email',
        phone_saved_at: now,
        updatedAt: new Date(),
      },
    },
  )
  await db.collection('user_extended_profiles').updateOne(
    { userId: user.id },
    {
      $set: {
        'basic.phone': phone,
        'basic.countryCode': countryCode,
        'basic.phoneVerified': false,
        'basic.phoneConfirmedVia': 'email',
        phone,
        phoneVerified: false,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now, userId: user.id },
    },
    { upsert: true },
  )
  await db.collection(COL).deleteOne({ userId: user.id })

  return NextResponse.json({ ok: true, phone, countryCode, phoneVerified: false, saved: true })
}
