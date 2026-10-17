import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions, newId } from '@/lib/db/interviews'
import { interviewRole } from '@/lib/interview-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!interviewRole(gate.user, session as unknown as Record<string, unknown>)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    question?: string; category?: string; difficulty?: string
    time_limit_seconds?: number; answer?: string; time_spent_seconds?: number
    order?: number; skipped?: boolean; ai_follow_up?: string
  }

  if (typeof body.question !== 'string' || !body.question.trim()) return NextResponse.json({ error: 'question is required' }, { status: 400 })
  if ((session.questions || []).length >= 100) return NextResponse.json({ error: 'Too many questions' }, { status: 400 })

  const q = {
    id: newId(),
    question: body.question.slice(0, 5000),
    category: typeof body.category === 'string' ? body.category.slice(0, 100) : 'General',
    difficulty: (['Easy', 'Medium', 'Hard'].includes(String(body.difficulty)) ? body.difficulty : 'Medium') as 'Easy' | 'Medium' | 'Hard',
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : (session.questions || []).length,
    time_limit_seconds: Math.max(10, Math.min(7200, Number(body.time_limit_seconds) || 60)),
    answer: typeof body.answer === 'string' ? body.answer.slice(0, 50000) : undefined,
    time_spent_seconds: Number.isFinite(Number(body.time_spent_seconds)) ? Math.max(0, Number(body.time_spent_seconds)) : undefined,
    skipped: body.skipped === true,
    ai_follow_up: typeof body.ai_follow_up === 'string' ? body.ai_follow_up.slice(0, 5000) : undefined,
  }

  await col.updateOne({ id }, { $push: { questions: q } as any, $set: { updated_at: new Date().toISOString() } })
  return NextResponse.json(q, { status: 201 })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    question_id?: string; answer?: string; time_spent_seconds?: number
    skipped?: boolean; ai_follow_up?: string
  }

  // Same participant / own-tenant staff check as POST (this used to have none).
  if (!interviewRole(gate.user, session as unknown as Record<string, unknown>)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!body.question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 })

  const questionIdx = (session.questions || []).findIndex((q) => q.id === body.question_id)
  if (questionIdx === -1) return NextResponse.json({ error: 'question not found' }, { status: 404 })

  const field = `questions.${questionIdx}`
  const $set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.answer === 'string') $set[`${field}.answer`] = body.answer.slice(0, 50000)
  if (Number.isFinite(Number(body.time_spent_seconds))) $set[`${field}.time_spent_seconds`] = Math.max(0, Number(body.time_spent_seconds))
  if (typeof body.skipped === 'boolean') $set[`${field}.skipped`] = body.skipped
  if (typeof body.ai_follow_up === 'string') $set[`${field}.ai_follow_up`] = body.ai_follow_up.slice(0, 5000)

  await col.updateOne({ id }, { $set })
  const updated = await col.findOne({ id })
  return NextResponse.json({ question: updated?.questions[questionIdx] })
}
