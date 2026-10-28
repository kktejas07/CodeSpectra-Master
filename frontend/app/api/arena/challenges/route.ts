import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { listArenaChallenges, arenaStats } from '@/lib/arena/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const [rows, stats] = await Promise.all([listArenaChallenges(), arenaStats()])
    // Engagement is real or zero — never the invented numbers the seeds used to carry.
    const data = rows.map(c => ({
      ...c,
      solved: stats[c.id]?.solved ?? 0,
      attempts: stats[c.id]?.attempts ?? 0,
    }))
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}
