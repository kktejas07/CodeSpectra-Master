import { NextResponse } from 'next/server'
import { expireTrials } from '@/lib/coupon-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const count = await expireTrials()
    return NextResponse.json({ ok: true, expired: count })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
