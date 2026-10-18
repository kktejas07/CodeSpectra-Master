/**
 * GET /api/admin/predictive-validity[?exam_id=X]
 *
 * Computed from real data: hiring outcomes recorded by staff
 * (hiring_outcomes) joined to each candidate's latest submission of the same
 * test. Maths and definitions: lib/hiring-outcomes.ts (buildValidityReport).
 * Tenant-scoped: tenant admins only see their own tests; superadmins all.
 * Submissions still waiting for grading are left out (their score isn't final).
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { submissionSectionScores } from '@/lib/exam-access'
import { resolveSections } from '@/lib/exam-sections'
import { buildValidityReport, isOutcomeStatus, OUTCOMES_COLLECTION, performanceOf, type ValidityRow } from '@/lib/hiring-outcomes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Doc = Record<string, unknown>

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const examFilter = new URL(request.url).searchParams.get('exam_id') || null
  try {
    const db = await getMongoDb()
    const scope = gate.user.role === 'superadmin' ? {} : { tenant_id: gate.user.tenantId }
    const exams = (await db.collection('exams')
      .find(scope, { projection: { _id: 0, id: 1, title: 1, sections: 1, questionList: 1 } }).toArray()) as Doc[]
    const examById = new Map(exams.map((e) => [String(e.id), e]))
    if (examFilter && !examById.has(examFilter)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const allOutcomes = examById.size
      ? (await db.collection(OUTCOMES_COLLECTION)
          .find({ exam_id: { $in: [...examById.keys()] } }, { projection: { _id: 0, exam_id: 1, user_id: 1, status: 1, ratings: 1 } }).toArray()) as Doc[]
      : []
    const perExam = new Map<string, number>()
    for (const o of allOutcomes) perExam.set(String(o.exam_id), (perExam.get(String(o.exam_id)) || 0) + 1)
    const outcomes = examFilter ? allOutcomes.filter((o) => o.exam_id === examFilter) : allOutcomes

    const subs = outcomes.length
      ? (await db.collection('exam_submissions').find(
          { exam_id: { $in: [...new Set(outcomes.map((o) => String(o.exam_id)))] }, user_id: { $in: [...new Set(outcomes.map((o) => String(o.user_id)))] } },
          { projection: { _id: 0, exam_id: 1, user_id: 1, score: 1, max_score: 1, details: 1, sections: 1, has_pending_review: 1, created_at: 1 } },
        ).toArray()) as Doc[]
      : []
    const latest = new Map<string, Doc>()
    for (const s of subs) {
      const k = `${s.exam_id}:${s.user_id}`
      const prev = latest.get(k)
      if (!prev || String(s.created_at || '') > String(prev.created_at || '')) latest.set(k, s)
    }

    const rows: ValidityRow[] = []
    const excluded = { pending_grading: 0, no_score: 0 }
    for (const o of outcomes) {
      if (!isOutcomeStatus(o.status)) continue
      const sub = latest.get(`${o.exam_id}:${o.user_id}`)
      const max = Number(sub?.max_score) || 0
      if (!sub || max <= 0) { excluded.no_score++; continue }
      if (sub.has_pending_review === true) { excluded.pending_grading++; continue }
      const exam = examById.get(String(o.exam_id))!
      const sections = examFilter
        ? Object.fromEntries(submissionSectionScores(exam, sub).map((sc) => [sc.id, sc.percent]))
        : undefined
      rows.push({
        score: Math.min(100, Math.max(0, (Number(sub.score) || 0) / max * 100)),
        sections,
        status: o.status,
        performance: performanceOf(o.ratings),
      })
    }

    // Section breakdown only for one test (sections differ between tests).
    const sectionMeta = examFilter ? resolveSections(examById.get(examFilter)!).map((s) => ({ id: s.id, title: s.title })) : []
    return NextResponse.json({
      exams: exams
        .map((e) => ({ id: String(e.id), title: String(e.title || 'Untitled test'), outcomes: perExam.get(String(e.id)) || 0 }))
        .filter((e) => e.outcomes > 0 || e.id === examFilter)
        .sort((a, b) => b.outcomes - a.outcomes || a.title.localeCompare(b.title)),
      selected: examFilter,
      report: buildValidityReport(rows, sectionMeta),
      excluded,
    })
  } catch (e) {
    console.error('[predictive-validity] GET:', e)
    return NextResponse.json({ error: 'Failed to compute predictive validity' }, { status: 500 })
  }
}
