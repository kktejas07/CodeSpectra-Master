/**
 * GET /api/admin/exams/[id]/compare?users=u1,u2[,u3,u4]
 *
 * Side-by-side view of 2–4 candidates on one test, for staff of the test's
 * tenant only (requireAdmin + requireTenantEntity). Scores are shown whether
 * or not they are released (each candidate carries `released`), since this is
 * a staff view; nothing here is ever sent to candidates. Answer keys are not
 * included — only correctness, points, code answers (coding questions), time,
 * integrity and identity-review signals, and the recorded hiring outcome.
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'
import { isRiskProctorEvent, submissionSectionScores } from '@/lib/exam-access'
import { resolveSections, sectionIndex } from '@/lib/exam-sections'
import { isCodingType, isScoredType } from '@/lib/question-types'
import { parseCodingAnswer } from '@/lib/coding-answer'
import { OUTCOMES_COLLECTION } from '@/lib/hiring-outcomes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Doc = Record<string, unknown>

export async function GET(request: Request, { params }: IdRouteContext) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await params
  const users = [...new Set((new URL(request.url).searchParams.get('users') || '').split(',').map((s) => s.trim()).filter((s) => s && s.length <= 128))]
  if (users.length < 2 || users.length > 4) return NextResponse.json({ error: 'Choose 2 to 4 candidates to compare.' }, { status: 400 })

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', id, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const exam = owned.doc as Doc

    const subsRaw = (await db.collection('exam_submissions').find({ exam_id: id, user_id: { $in: users } }, { projection: { id_photo: 0, face_photo: 0 } }).toArray()) as Doc[]
    // Latest attempt per candidate (legacy rows may hold several).
    const subs = new Map<string, Doc>()
    for (const s of subsRaw) {
      const prev = subs.get(String(s.user_id))
      if (!prev || String(s.created_at || '') > String(prev.created_at || '')) subs.set(String(s.user_id), s)
    }
    if (subs.size < 2) return NextResponse.json({ error: 'At least two of these candidates have not submitted this test.' }, { status: 404 })

    const sections = resolveSections(exam)
    const secOf = sectionIndex(sections)
    const qs = (Array.isArray(exam.questionList) ? exam.questionList : []) as Doc[]
    const questions = qs.map((q) => ({
      id: String(q.id),
      title: String(q.title || 'Question'),
      type: String(q.type || ''),
      points: Number(q.points ?? q.score) || 0,
      scored: isScoredType(q.type),
      coding: isCodingType(q.type),
      section_id: secOf.get(String(q.id)) ?? null,
    }))

    const ids = [...subs.keys()]
    const [userDocs, events, outcomes] = await Promise.all([
      db.collection('user').find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids as never[] } }] }, { projection: { id: 1, name: 1, fullName: 1, email: 1 } }).toArray(),
      db.collection('proctor_events').find({ session_kind: 'exam', session_id: id, user_id: { $in: ids } }, { projection: { _id: 0, user_id: 1, event_type: 1 } }).toArray(),
      db.collection(OUTCOMES_COLLECTION).find({ exam_id: id, user_id: { $in: ids } }, { projection: { _id: 0, user_id: 1, status: 1 } }).toArray(),
    ])
    const nameOf = new Map<string, { name: string; email: string }>()
    for (const u of userDocs) nameOf.set(String(u.id ?? u._id), { name: String(u.fullName || u.name || ''), email: String(u.email || '') })
    const outcomeOf = new Map(outcomes.map((o) => [String(o.user_id), String(o.status || '')]))

    const candidates = users.filter((u) => subs.has(u)).map((uid) => {
      const sub = subs.get(uid)!
      const details = (Array.isArray(sub.details) ? sub.details : []) as Doc[]
      const answers = (sub.answers && typeof sub.answers === 'object' ? sub.answers : {}) as Record<string, unknown>
      const perQuestion: Record<string, { correct: boolean; awarded: number | null; points: number; pending: boolean; answered: boolean }> = {}
      for (const d of details) {
        const qid = String(d.qId)
        perQuestion[qid] = {
          correct: d.correct === true,
          awarded: typeof d.awarded === 'number' ? d.awarded : null,
          points: Number(d.points) || 0,
          pending: d.pending_review === true,
          answered: String(d.answer ?? answers[qid] ?? '').trim() !== '',
        }
      }
      const code: Record<string, { language: string; code: string }> = {}
      for (const q of questions) {
        if (!q.coding) continue
        const raw = answers[q.id]
        if (raw === undefined || raw === null || raw === '') continue
        const parsed = parseCodingAnswer(String(raw))
        code[q.id] = { language: parsed.language, code: parsed.code.slice(0, 50_000) }
      }
      const mine = events.filter((e) => String(e.user_id) === uid)
      const byType: Record<string, number> = {}
      let flags = 0
      for (const e of mine) {
        if (!isRiskProctorEvent(e.event_type)) continue
        flags++
        const t = String(e.event_type)
        byType[t] = (byType[t] || 0) + 1
      }
      const ic = (sub.identity_check || null) as Doc | null
      const fm = (ic?.face_match || null) as Doc | null
      const who = nameOf.get(uid)
      const score = Number(sub.score) || 0
      const max = Number(sub.max_score) || 0
      return {
        user_id: uid,
        name: who?.name || String(sub.email || '').split('@')[0] || 'Candidate',
        email: who?.email || String(sub.email || ''),
        released: sub.score_released === true || !!sub.released_at,
        score,
        max_score: max,
        percent: max > 0 ? Math.min(100, Math.round((score / max) * 100)) : null,
        has_pending_review: sub.has_pending_review === true,
        attempt_no: Number(sub.attempt_no) || 1,
        submitted_at: (sub.submitted_at || sub.created_at || null) as string | null,
        total_time_ms: typeof sub.total_time_ms === 'number' ? sub.total_time_ms : null,
        auto_submitted: sub.auto_submitted === true,
        section_scores: submissionSectionScores(exam, sub),
        questions: perQuestion,
        code,
        integrity: { flags, by_type: byType, events: mine.length },
        identity: {
          method: (ic?.method as string | undefined) ?? null,
          needs_manual_review: ic?.needs_manual_review === true,
          face_similarity: fm?.status === 'compared' && typeof fm.similarity === 'number' ? fm.similarity : null,
          face_likely_match: fm?.status === 'compared' ? fm.likely_match === true : null,
        },
        outcome: outcomeOf.get(uid) || null,
      }
    })

    return NextResponse.json({
      exam: { id: exam.id, title: exam.title, sections: sections.map((s) => ({ id: s.id, title: s.title })), questions },
      candidates,
      missing: users.filter((u) => !subs.has(u)),
    })
  } catch (e) {
    console.error('[compare] GET:', e)
    return NextResponse.json({ error: 'Failed to load comparison' }, { status: 500 })
  }
}
