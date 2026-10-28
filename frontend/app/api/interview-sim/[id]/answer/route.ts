/**
 * POST /api/interview-sim/[id]/answer — answer the current question
 * { turn, text, input: 'text' | 'voice', duration_ms?, code?, code_language? }
 * → the session with the next question, a follow-up, or the report.
 */
import { NextRequest, NextResponse } from 'next/server'
import { limitRequest } from '@/lib/rate-limit'
import { SESSION_ID_RE, failRes, readJson, serverError, simUser } from '@/lib/interview-sim/http'
import { AnswerInputSchema } from '@/lib/interview-sim/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 90

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await simUser()
  if ('res' in g) return g.res
  const { id } = await ctx.params
  if (!SESSION_ID_RE.test(id)) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
  const limited = await limitRequest(req, 'interview-sim-answer', g.user.id, 40, 10 * 60_000)
  if (limited) return limited
  const parsed = AnswerInputSchema.safeParse(await readJson(req))
  if (!parsed.success) return NextResponse.json({ error: 'Your answer could not be read. Keep it under 6,000 characters.' }, { status: 400 })
  try {
    const { answerTurn, toView } = await import('@/lib/interview-sim/engine')
    const r = await answerTurn({ id: g.user.id }, id, parsed.data)
    if (!r.ok) return failRes(r)
    return NextResponse.json({ session: await toView(r.session) })
  } catch (e) {
    return serverError('answer', e)
  }
}
