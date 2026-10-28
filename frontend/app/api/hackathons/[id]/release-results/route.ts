import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { releaseHackathonResults } from '@/lib/services/hackathons'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { force?: unknown }

  // Staff check, guard rails, ranking, XP, reports and notifications:
  // lib/services/hackathons (shared with the admin agent).
  const r = await releaseHackathonResults(user, id, { force: body?.force === true })
  if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
  return NextResponse.json(r.data)
}
