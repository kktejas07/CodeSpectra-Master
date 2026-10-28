/**
 * POST /api/exams/[id]/black-box — run the hidden reference solution of a
 * reverse_coding question on the candidate's own input (Piston), so they can
 * probe the behaviour they must reproduce. Body: { question_id, input,
 * inviteToken?, linkToken? }.
 *
 * Never reveals the source: only stdout comes back. stderr is dropped (a
 * traceback quotes source lines), and a failed run returns a fixed message.
 * Same entry gate as submit, only during a running attempt, and limited to
 * the question's `black_box_runs` per hour (Redis limiter, in-memory fallback).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { attemptTimeState, checkExamEntry, getExamDraft } from '@/lib/exam-access'
import { limitRequest } from '@/lib/rate-limit'
import { executeOnce } from '@/lib/piston'
import { canonicalType } from '@/lib/question-types'
import { BLACK_BOX_INPUT_MAX, extendedFieldsOf } from '@/lib/question-extensions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  question_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  input: z.string().max(BLACK_BOX_INPUT_MAX),
  inviteToken: z.string().max(512).nullish(),
  linkToken: z.string().max(512).nullish(),
})

const OUTPUT_MAX = 4000

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'You must be signed in to take this assessment.', code: 'exam_signin_required' }, { status: 401 })
  const user = gate.user
  const { id: examId } = await ctx.params
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `Send a question and an input of up to ${BLACK_BOX_INPUT_MAX} characters.`, code: 'bb_input_max', params: { max: BLACK_BOX_INPUT_MAX } }, { status: 400 })
  const body = parsed.data

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId })
    if (!exam) return NextResponse.json({ error: 'Exam not found', code: 'exam_not_found' }, { status: 404 })
    const access = await checkExamEntry(db, exam as Record<string, unknown>, { id: user.id, email: user.email }, { inviteToken: body.inviteToken ?? null, linkToken: body.linkToken ?? null })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
    const draft = await getExamDraft(db, examId, user.id)
    const time = attemptTimeState(exam as Record<string, unknown>, draft, access.attemptNo)
    if (time.status !== 'running') return NextResponse.json({ error: time.status === 'expired' ? 'Time is up for this attempt.' : 'Start the assessment first.' }, { status: 409 })

    const list = (Array.isArray(exam.questionList) ? exam.questionList : []) as Record<string, unknown>[]
    const q = list.find((x) => String(x?.id) === body.question_id)
    const ext = q ? extendedFieldsOf(q) : null
    if (!q || canonicalType(q.type) !== 'reverse_coding' || !ext?.reference_solution || !ext.black_box_runs) {
      return NextResponse.json({ error: 'This question has no black box to run.' }, { status: 400 })
    }

    const limited = await limitRequest(req, `black-box:${examId}:${body.question_id}:a${access.attemptNo}`, user.id, ext.black_box_runs, 60 * 60_000)
    if (limited) return NextResponse.json({ error: `You've used all ${ext.black_box_runs} black-box runs for this hour.`, code: 'bb_runs_used', params: { n: Number(ext.black_box_runs) } }, { status: 429, headers: limited.headers })

    try {
      const r = await executeOnce({ language: ext.reference_solution.language, source: ext.reference_solution.code, stdin: body.input, timeoutMs: 5000 })
      if (r.run.code !== 0) return NextResponse.json({ ok: false, output: '', message: 'The black box could not process this input.' })
      const out = String(r.run.stdout || '')
      return NextResponse.json({ ok: true, output: out.slice(0, OUTPUT_MAX), truncated: out.length > OUTPUT_MAX })
    } catch {
      return NextResponse.json({ error: 'The code runner is busy. Try again in a moment.', code: 'exam_runner_busy' }, { status: 503 })
    }
  } catch (e) {
    console.error('[black-box] POST:', e instanceof Error ? e.message : 'error')
    return NextResponse.json({ error: 'Run failed', code: 'exam_run_failed' }, { status: 500 })
  }
}
