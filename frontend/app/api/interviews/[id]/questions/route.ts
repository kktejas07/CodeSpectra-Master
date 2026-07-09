import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions, newId } from '@/lib/db/interviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (session.candidate_id !== gate.user.id && session.interviewer_id !== gate.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    question?: string; category?: string; difficulty?: string
    time_limit_seconds?: number; answer?: string; time_spent_seconds?: number
    order?: number; skipped?: boolean; ai_follow_up?: string
  }

  if (!body.question) return NextResponse.json({ error: 'question is required' }, { status: 400 })

  const q = {
    id: newId(),
    question: body.question,
    category: body.category || 'General',
    difficulty: (body.difficulty as any) || 'Medium',
    order: body.order ?? session.questions.length,
    time_limit_seconds: body.time_limit_seconds || 60,
    answer: body.answer,
    time_spent_seconds: body.time_spent_seconds,
    skipped: body.skipped || false,
    ai_follow_up: body.ai_follow_up,
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

  if (!body.question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 })

  const questionIdx = session.questions.findIndex((q) => q.id === body.question_id)
  if (questionIdx === -1) return NextResponse.json({ error: 'question not found' }, { status: 404 })

  const field = `questions.${questionIdx}`
  const $set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.answer !== undefined) $set[`${field}.answer`] = body.answer
  if (body.time_spent_seconds !== undefined) $set[`${field}.time_spent_seconds`] = body.time_spent_seconds
  if (body.skipped !== undefined) $set[`${field}.skipped`] = body.skipped
  if (body.ai_follow_up !== undefined) $set[`${field}.ai_follow_up`] = body.ai_follow_up

  await col.updateOne({ id }, { $set })
  const updated = await col.findOne({ id })
  return NextResponse.json({ question: updated?.questions[questionIdx] })
}
