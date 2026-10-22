/**
 * /api/interview-sim (signed-in learner)
 * GET  — setup options (companies + patterns, caps left, voice support) and the learner's history.
 * POST — start a session { company?, pattern_id?, role, level, round, language, mode, code_language?, record, consent, retake_of? }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { failRes, readJson, serverError, simUser } from '@/lib/interview-sim/http'
import { StartInputSchema } from '@/lib/interview-sim/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const g = await simUser()
  if ('res' in g) return g.res
  try {
    const { simOptions, toHistoryItem } = await import('@/lib/interview-sim/engine')
    const { listOwnSessions, recordings } = await import('@/lib/interview-sim/store')
    const [options, rows] = await Promise.all([simOptions(g.user.id), listOwnSessions(g.user.id)])
    const withRec = new Set((await (await recordings()).find({ user_id: g.user.id }, { projection: { _id: 0, session_id: 1 } }).toArray()).map((r) => r.session_id))
    return NextResponse.json({ options, sessions: rows.map((s) => toHistoryItem(s, withRec.has(s.id))) })
  } catch (e) {
    return serverError('list', e)
  }
}

export async function POST(req: NextRequest) {
  const g = await simUser()
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'interview-sim-start', g.user.id, 6, 10 * 60_000)
  if (limited) return limited
  const parsed = StartInputSchema.safeParse(await readJson(req))
  if (!parsed.success) {
    const i = parsed.error.issues[0]
    return NextResponse.json({ error: i ? `${i.path.join('.') || 'input'}: ${i.message}` : 'Invalid request' }, { status: 400 })
  }
  try {
    const { startSession, toView } = await import('@/lib/interview-sim/engine')
    const r = await startSession({ id: g.user.id, role: g.user.role }, parsed.data)
    if (!r.ok) return failRes(r)
    return NextResponse.json({ session: await toView(r.session) }, { status: 201 })
  } catch (e) {
    return serverError('start', e)
  }
}
