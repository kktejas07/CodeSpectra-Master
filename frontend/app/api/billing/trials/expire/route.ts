import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { expireTrials } from '@/lib/coupon-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const count = await expireTrials()
    return NextResponse.json({ ok: true, expired: count })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
