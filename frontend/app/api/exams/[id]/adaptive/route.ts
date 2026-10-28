/**
 * Adaptive tests (lib/adaptive-test.ts, lib/adaptive-test-server.ts).
 *
 * POST (candidate, attempt running) { question_id, answer } — grades the
 *   current question on the server, picks the next difficulty and returns
 *   the next question (or done). The client never sees the pool or keys.
 * GET  (test staff) [?domain=] — adaptive settings, domains, and approved
 *   question counts per level with a warning when a level is thin (< 50).
 * PUT  (test staff) { adaptive, adaptive_domain, adaptive_length } — save.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { attemptTimeState, getExamDraft, isExamStaff } from '@/lib/exam-access'
import { isAdaptiveExam, normalizeAdaptiveSettings, thinLevels, THIN_BANK_MIN, ADAPTIVE_LENGTH_DEFAULT } from '@/lib/adaptive-test'
import { adaptivePoolCounts, answerAdaptive } from '@/lib/adaptive-test-server'
import { knowledgeOnTestChange } from '@/lib/rag/hooks'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const AnswerBody = z.object({
  question_id: z.string().regex(/^a\d{1,3}$/),
  answer: z.union([z.string().max(5000), z.array(z.string().max(500)).max(50)]),
})

export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.', code: 'exam_signin_required' }, { status: 401 })
  const { id: examId } = await ctx.params
  const rl = rateLimitSlidingWindow(`exam-adaptive:${gate.user.id}:${examId}`, 120, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests', code: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const parsed = AnswerBody.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'question_id and answer are required' }, { status: 400 })
  const answer = Array.isArray(parsed.data.answer) ? parsed.data.answer.join(', ') : parsed.data.answer

  try {
    const db = await getMongoDb()
    const exam = (await db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, id: 1, published: 1, duration: 1, ends_at: 1, adaptive: 1, adaptive_domain: 1, adaptive_length: 1 } })) as Record<string, unknown> | null
    if (!exam || !exam.published || !isAdaptiveExam(exam)) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })

    // Same rule as save-draft: only the running attempt (started via ./start) can answer.
    const draft = await getExamDraft(db, examId, gate.user.id)
    const attemptNo = Number(draft?.attempt_no) || 0
    const state = attemptTimeState(exam, draft, attemptNo)
    if (state.status !== 'running' || draft?.submitted_at) {
      return NextResponse.json({ error: state.status === 'expired' ? 'Time is up for this attempt.' : 'No attempt in progress.', expired: state.status === 'expired' }, { status: state.status === 'expired' ? 410 : 409 })
    }
    const r = await answerAdaptive(db, exam, gate.user.id, attemptNo, parsed.data.question_id, answer)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true, adaptive: r.view })
  } catch (e) {
    logger.error(`[exams/adaptive] POST: ${(e as Error)?.message}`)
    return NextResponse.json({ error: 'Could not save your answer', code: 'exam_answer_save_failed' }, { status: 500 })
  }
}

async function staffGate(ctx: Ctx) {
  const gate = await requireAuth()
  if ('error' in gate) return { res: NextResponse.json({ error: gate.error }, { status: gate.status }) }
  const { id } = await ctx.params
  const db = await getMongoDb()
  const exam = (await db.collection('exams').findOne({ id }, { projection: { _id: 0, id: 1, tenant_id: 1, adaptive: 1, adaptive_domain: 1, adaptive_length: 1 } })) as Record<string, unknown> | null
  if (!exam) return { res: NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 }) }
  if (!isExamStaff(gate.user, exam)) return { res: NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 }) }
  return { db, exam, user: gate.user }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await staffGate(ctx)
  if ('res' in g) return g.res
  try {
    const { listDomains } = await import('@/lib/question-bot/store')
    const domains = (await listDomains()).map((d) => ({ id: d.id, label: d.label, active: d.active }))
    const q = new URL(req.url).searchParams.get('domain')?.trim().toLowerCase() || ''
    const domainId = /^[a-z0-9_]{2,40}$/.test(q) ? q : typeof g.exam.adaptive_domain === 'string' ? g.exam.adaptive_domain : ''
    const counts = domainId ? await adaptivePoolCounts(g.db, domainId) : null
    return NextResponse.json({
      settings: {
        adaptive: g.exam.adaptive === true,
        adaptive_domain: typeof g.exam.adaptive_domain === 'string' ? g.exam.adaptive_domain : null,
        adaptive_length: Number(g.exam.adaptive_length) || ADAPTIVE_LENGTH_DEFAULT,
      },
      domains,
      pool: counts ? { domain: domainId, counts, thin: thinLevels(counts), min: THIN_BANK_MIN } : null,
    })
  } catch (e) {
    logger.error(`[exams/adaptive] GET: ${(e as Error)?.message}`)
    return NextResponse.json({ error: 'Failed to load adaptive settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const g = await staffGate(ctx)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  const v = normalizeAdaptiveSettings(body as Record<string, unknown>)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    if (v.value.adaptive_domain) {
      const { getDomain } = await import('@/lib/question-bot/store')
      if (!(await getDomain(v.value.adaptive_domain))) return NextResponse.json({ error: 'Unknown domain.' }, { status: 400 })
    }
    await g.db.collection('exams').updateOne({ id: String(g.exam.id) }, { $set: { ...v.value, updatedAt: new Date().toISOString() } })
    knowledgeOnTestChange(String(g.exam.id), g.exam.tenant_id)
    return NextResponse.json({ ok: true, settings: v.value })
  } catch (e) {
    logger.error(`[exams/adaptive] PUT: ${(e as Error)?.message}`)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
