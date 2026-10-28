import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — live SME review queue aggregated from exam_submissions.
 *
 * Provenance: nothing anywhere writes to an `sme_reviews` collection
 * (verified by repo-wide grep — only this route reads it), and no
 * SME-assignment workflow exists. So this returns the submissions that
 * genuinely need human grading:
 *   - `has_pending_review` (set on submit / by AI grading, cleared by the
 *     manual-grading PATCH in exams/[id]/submissions/[userId]), or
 *   - per-question `details[].pending_review` / `requires_human_review`
 *     (AI low-confidence: confidence < 0.75 in lib/ai/grade-question).
 * Items match the ReviewTask shape rendered by /dashboard/admin/sme-review.
 * Honest empty: `[]` when nothing needs review. No POST — there is no
 * assignment flow to persist to.
 */
const toPercent = (score: unknown, max: unknown): number => {
  const s = Number(score)
  const m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0
  return Math.min(100, Math.round((s / m) * 100))
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const scoped = gate.user.role === 'tenant_admin' && !!gate.user.tenantId

    const exams = await db.collection('exams')
      .find(scoped ? { tenant_id: gate.user.tenantId } : {})
      .project({ id: 1, title: 1, subject: 1 })
      .toArray()
    const examById = new Map<string, any>(exams.map((e: any) => [e.id, e]))

    const subFilter: Record<string, unknown> = {
      $or: [
        { has_pending_review: true },
        { 'details.pending_review': true },
        { 'details.requires_human_review': true },
      ],
    }
    if (scoped) {
      if (examById.size === 0) return NextResponse.json({ data: [] })
      subFilter.exam_id = { $in: Array.from(examById.keys()) }
    }

    const submissions = await db.collection('exam_submissions')
      .find(subFilter)
      .sort({ submitted_at: -1 })
      .toArray()

    const userIds = [...new Set(submissions.map((s: any) => s.user_id).filter(Boolean))]
    const examIds = [...new Set(submissions.map((s: any) => s.exam_id).filter(Boolean))]

    // Candidate names: `user` collection first, candidate_invites as fallback.
    const userMap = new Map<string, { name: string; email: string }>()
    await Promise.all(userIds.map(async (uid: string) => {
      const u = await db.collection('user').findOne(
        { $or: [{ _id: uid as any }, { id: uid }] },
        { projection: { name: 1, fullName: 1, email: 1 } },
      )
      if (u) userMap.set(uid, { name: (u.fullName || u.name || '') as string, email: (u.email || '') as string })
    }))
    const inviteDocs = userIds.length > 0
      ? await db.collection('candidate_invites')
        .find({ user_id: { $in: userIds } })
        .project({ user_id: 1, full_name: 1, email: 1, created_at: 1 })
        .toArray()
      : []
    const inviteByUser = new Map<string, any>()
    for (const inv of inviteDocs) {
      const cur = inviteByUser.get(inv.user_id)
      if (!cur || String(inv.created_at || '') > String(cur.created_at || '')) inviteByUser.set(inv.user_id, inv)
    }

    // Proctor-event counts per (exam, user) for integrity flags.
    const proctorCounts = examIds.length > 0 && userIds.length > 0
      ? await db.collection('proctor_events').aggregate([
        { $match: { session_kind: 'exam', session_id: { $in: examIds }, user_id: { $in: userIds } } },
        { $group: { _id: { exam: '$session_id', user: '$user_id' }, count: { $sum: 1 } } },
      ]).toArray()
      : []
    const proctorMap = new Map<string, number>(
      proctorCounts.map((p: any) => [`${p._id.exam}::${p._id.user}`, p.count as number]),
    )

    const data = submissions.map((sub: any) => {
      const exam = examById.get(sub.exam_id)
      const user = userMap.get(sub.user_id) || { name: '', email: '' }
      const inv = inviteByUser.get(sub.user_id) || {}
      const details = Array.isArray(sub.details) ? sub.details : []
      const pendingCount = details.filter((d: any) => d && d.pending_review === true).length
      const aiFlagged = details.some((d: any) => d && (d.requires_human_review === true
        || (typeof d.confidence === 'number' && d.confidence < 0.75)))
      const proctorCount = proctorMap.get(`${sub.exam_id}::${sub.user_id}`) || 0

      const flags: string[] = []
      if (pendingCount > 0) flags.push(`${pendingCount} answer${pendingCount === 1 ? '' : 's'} need grading`)
      else if (sub.has_pending_review === true) flags.push('awaiting manual review')
      if (aiFlagged) flags.push('AI flagged for human review')
      if (proctorCount > 0) flags.push(`${proctorCount} proctor event${proctorCount === 1 ? '' : 's'}`)

      const email = (user.email || inv.email || sub.email || '') as string
      return {
        id: sub.id || `${sub.exam_id}:${sub.user_id}`,
        title: (exam && exam.title) || 'Assessment',
        candidateName: (user.name || inv.full_name || (email ? email.split('@')[0] : '') || 'Candidate') as string,
        type: ((exam && exam.subject) || 'assessment') as string,
        score: toPercent(sub.score, sub.max_score),
        status: 'pending_review',
        flags,
      }
    })

    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 }) }
}
