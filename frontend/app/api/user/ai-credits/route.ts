import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getUserAiCredits, deductUserAiCredits } from '@/lib/user-credits'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const credits = await getUserAiCredits(gate.user.id)
    return NextResponse.json(credits)
  } catch (e) {
    console.error('[ai-credits GET] error:', e)
    return NextResponse.json({ error: 'Failed to fetch AI credits' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { amount = 1 } = await req.json().catch(() => ({}))
    
    const credits = await getUserAiCredits(gate.user.id)
    if (credits.balance < amount) {
      return NextResponse.json({ error: 'Insufficient credits', balance: credits.balance }, { status: 403 })
    }

    await deductUserAiCredits(gate.user.id, amount)
    return NextResponse.json({ success: true, balance: credits.balance - amount })
  } catch (e) {
    console.error('[ai-credits POST] error:', e)
    return NextResponse.json({ error: 'Failed to deduct AI credits' }, { status: 500 })
  }
}
