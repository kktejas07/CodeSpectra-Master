/**
 * GET  /api/contests — public listing (published, public, not ended + recently ended).
 * POST /api/contests — create a contest (superadmin / tenant admin; lib/contests/service).
 */
import { NextResponse } from 'next/server'
import { contestPhase } from '@/lib/contests/config'
import { listPublicContests } from '@/lib/contests/participation'
import { createContest, publicContest } from '@/lib/contests/service'
import { guarded, readJson, respond, unauthorized, withUser } from '@/lib/contests/http'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const limited = await limitRequest(req, 'contests-list', null, 120, 60_000)
  if (limited) return limited
  return guarded('list', async () => {
    const rows = await listPublicContests({ includeEnded: true })
    return NextResponse.json({ items: rows.map((c) => ({ ...publicContest(c), config: undefined, phase: contestPhase(c) })) })
  })
}

export async function POST(req: Request) {
  const user = await withUser()
  if (!user) return unauthorized()
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
  return guarded('create', async () => respond(await createContest(user, await readJson(req))))
}
