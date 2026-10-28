import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/admin'
import { randomInt } from 'crypto'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[randomInt(chars.length)]
  }
  return code
}

export async function POST() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const db = await getMongoDb()
    const col = db.collection('referrals')
    const existing = await col.findOne({ referrer_id: gate.user.id, kind: { $ne: 'redemption' } })
    if (existing) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      return NextResponse.json({ code: existing.referral_code, url: `${baseUrl}/auth/signup?ref=${existing.referral_code}` })
    }

    let code = generateCode()
    let attempts = 0
    while (attempts < 10) {
      const dup = await col.findOne({ referral_code: code })
      if (!dup) break
      code = generateCode()
      attempts++
    }

    await col.insertOne({
      id: newId(),
      referrer_id: gate.user.id,
      referred_id: '',
      referred_email: '',
      referral_code: code,
      status: 'pending',
      xp_awarded: 0,
      commission_earned: 0,
      created_at: nowIso(),
      completed_at: null,
      commissioned_at: null,
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.json({ code, url: `${baseUrl}/auth/signup?ref=${code}` })
  } catch (e) {
    console.error('[referral/generate] error:', e)
    return NextResponse.json({ error: 'Failed to generate referral code' }, { status: 500 })
  }
}
