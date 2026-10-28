import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { loadArenaChallenge, arenaStats } from '@/lib/arena/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/arena/challenges/[id]
 *
 * The detail page used to read the hardcoded seed array, so a generated
 * challenge listed on /dashboard/arena 404'd on click. One source of truth now.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await ctx.params
  const challenge = await loadArenaChallenge(id)
  if (!challenge) {
    return NextResponse.json({ error: 'Unknown challenge', code: 'not_found' }, { status: 404 })
  }

  const stats = await arenaStats()
  return NextResponse.json({
    data: { ...challenge, ...(stats[challenge.id] ?? {}) },
  })
}
