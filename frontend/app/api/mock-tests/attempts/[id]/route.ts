/**
 * GET /api/mock-tests/attempts/:id -> one of the caller's attempts.
 * Submitted: per-question review (your answer, correct answer, explanation).
 * In progress: summary only — the answer key is never sent before submission.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { RESUME_WINDOW_MS, mockTestSessions } from '../../_sessions'
import { reviewQuestions, toHistoryRow } from '../../_history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id } = await ctx.params
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

  try {
    const doc = await (await mockTestSessions()).findOne(
      { id, user_id: gate.user.id, abandoned_at: { $exists: false } },
      { projection: { _id: 0 } },
    )
    const expired = doc && !doc.submitted_at && Date.now() - Date.parse(doc.created_at) > RESUME_WINDOW_MS
    if (!doc || expired || (!doc.submitted_at && !doc.questions?.length)) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }
    const answered = doc.submitted_at
      ? Object.keys(doc.answers ?? {}).length
      : Object.keys(doc.progress?.answers ?? {}).length
    return NextResponse.json({
      attempt: { ...toHistoryRow(doc), answered },
      questions: reviewQuestions(doc),
    })
  } catch (e) {
    console.error('[mock-tests attempt] GET', e)
    return NextResponse.json({ error: 'Could not load this attempt' }, { status: 500 })
  }
}
