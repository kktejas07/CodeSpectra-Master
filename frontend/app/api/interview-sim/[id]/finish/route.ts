/** POST /api/interview-sim/[id]/finish — end now and build the report from the answers so far. */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { SESSION_ID_RE, failRes, serverError, simUser } from '@/lib/interview-sim/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  const limited = await limitRequest(req, 'interview-sim-finish', g.user.id, 10, 10 * 60_000)
  if (limited) return limited
  try {
    const { finishSession, toView } = await import('@/lib/interview-sim/engine')
    const r = await finishSession({ id: g.user.id }, id)
    if (!r.ok) return failRes(r)
    return NextResponse.json({ session: await toView(r.session) })
  } catch (e) {
    return serverError('finish', e)
  }
}
