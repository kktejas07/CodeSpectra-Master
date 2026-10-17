import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getUserAiCredits } from '@/lib/user-credits'

export const dynamic = 'force-dynamic'

/**
 * GET /api/user/ai-credits — read-only balance for the signed-in user.
 * Credits are spent only server-side inside the AI routes (lib/user-credits.ts
 * spendAiCredits); there is deliberately no client-facing spend endpoint.
 */
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
