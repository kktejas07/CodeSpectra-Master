import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — live hiring funnel aggregated from candidate_invites × exam_submissions
 * (+ job_applications/job_postings for role + pipeline status).
 *
 * Provenance: nothing anywhere writes to a `hiring_reports` collection
 * (verified by repo-wide grep — only this route reads it). One row per
 * candidate: per-assessment scores, composite average, funnel/pipeline
 * status. An extra top-level `funnel` summary is included; the page reads
 * `json.data` so the rendered shape is unchanged. Honest empty: `[]`
 * (plus zeroed funnel) when no invites/submissions exist. No POST — there
 * is no report-generation flow to persist to.
 */
const toPercent = (score: unknown, max: unknown): number => {
  const s = Number(score)
  const m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0
  return Math.min(100, Math.round((s / m) * 100))
}

const emptyFunnel = { invited: 0, completed: 0, passed: 0, candidates: 0 }

/** Bounds (CORE-029): no request reads unbounded collections. */
const MAX_DOCS = 20_000
const SUB_PROJ = { _id: 0, user_id: 1, email: 1, exam_id: 1, score: 1, max_score: 1, passed: 1 }
const INV_PROJ = { _id: 0, user_id: 1, email: 1, full_name: 1, status: 1, created_at: 1 }

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const scoped = gate.user.role === 'tenant_admin' && !!gate.user.tenantId

    const exams = await db.collection('exams')
      .find(scoped ? { tenant_id: gate.user.tenantId } : {})
      .project({ id: 1, title: 1 })
      .toArray()
    const examTitleById = new Map<string, string>(exams.map((e: any) => [e.id, e.title || 'Assessment']))
    const examIds = Array.from(examTitleById.keys())

    if (scoped && examIds.length === 0) return NextResponse.json({ data: [], funnel: emptyFunnel })

    // Indexed lookups by exam_id / exam_ids (A-012 backfilled them), projected and bounded —
    // was: every submission and a regex-per-exam scan of every invite.
    const submissions = await db.collection('exam_submissions')
      .find(scoped ? { exam_id: { $in: examIds } } : {}, { projection: SUB_PROJ })
      .sort({ created_at: -1 })
      .limit(MAX_DOCS)
      .toArray()
    const invites: any[] = await db.collection('candidate_invites')
      .find(scoped ? { $or: [{ exam_id: { $in: examIds } }, { exam_ids: { $in: examIds } }] } : {}, { projection: INV_PROJ })
      .sort({ created_at: -1 })
      .limit(MAX_DOCS)
      .toArray()

    interface CandRow {
      userId: string
      email: string
      invite: any | null
      subs: any[]
    }
    const rows = new Map<string, CandRow>()
    const keyOf = (userId: unknown, email: unknown) =>
      String(userId || '').trim() || String(email || '').toLowerCase().trim()
    const ensureRow = (userId: unknown, email: unknown): CandRow | null => {
      const key = keyOf(userId, email)
      if (!key) return null
      let row = rows.get(key)
      if (!row) {
        row = { userId: String(userId || ''), email: String(email || ''), invite: null, subs: [] }
        rows.set(key, row)
      }
      if (userId && !row.userId) row.userId = String(userId)
      if (email && !row.email) row.email = String(email)
      return row
    }

    // Latest invite per candidate wins.
    for (const inv of invites) {
      const row = ensureRow(inv.user_id, inv.email)
      if (!row) continue
      if (!row.invite || String(inv.created_at || '') > String(row.invite.created_at || '')) row.invite = inv
    }
    for (const sub of submissions) {
      const row = ensureRow(sub.user_id, sub.email)
      if (row) row.subs.push(sub)
    }

    if (rows.size === 0) return NextResponse.json({ data: [], funnel: emptyFunnel })

    // Candidate names from `user`; job applications for role + pipeline status.
    const candidateUserIds = [...rows.values()].map(r => r.userId).filter(Boolean)
    const userMap = new Map<string, { name: string; email: string }>()
    for (let i = 0; i < candidateUserIds.length; i += 1000) {
      const ids = candidateUserIds.slice(i, i + 1000)
      const found = await db.collection('user')
        .find({ $or: [{ id: { $in: ids } }, { _id: { $in: ids as any[] } }] }, { projection: { _id: 1, id: 1, name: 1, fullName: 1, email: 1 } })
        .toArray()
      for (const u of found) userMap.set(String(u.id || u._id), { name: (u.fullName || u.name || '') as string, email: (u.email || '') as string })
    }

    const apps = candidateUserIds.length > 0
      ? await db.collection('job_applications').find({ user_id: { $in: candidateUserIds } }, { projection: { _id: 0, user_id: 1, job_id: 1, status: 1, applied_at: 1 } }).limit(MAX_DOCS).toArray()
      : []
    const appByUser = new Map<string, any>()
    for (const app of apps) {
      const cur = appByUser.get(app.user_id)
      if (!cur || String(app.applied_at || '') > String(cur.applied_at || '')) appByUser.set(app.user_id, app)
    }
    const jobIds = [...new Set([...appByUser.values()].map((a: any) => a.job_id).filter(Boolean))]
    const jobDocs = jobIds.length > 0
      ? await db.collection('job_postings').find({ id: { $in: jobIds } }).project({ id: 1, title: 1 }).toArray()
      : []
    const jobTitleById = new Map<string, string>(jobDocs.map((j: any) => [j.id, j.title || '']))

    const data = [...rows.values()].map((row) => {
      const user = (row.userId && userMap.get(row.userId)) || { name: '', email: '' }
      const email = row.email || user.email || row.invite?.email || ''
      const name = user.name || row.invite?.full_name || (email ? email.split('@')[0] : '') || 'Candidate'

      const scores: Record<string, number> = {}
      for (const sub of row.subs) {
        scores[examTitleById.get(sub.exam_id) || 'Assessment'] = toPercent(sub.score, sub.max_score)
      }
      const pcts = Object.values(scores)
      const composite = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0

      const app = (row.userId && appByUser.get(row.userId)) || null
      const passed = row.subs.some((s: any) => s.passed === true)
      const status = app && app.status
        ? String(app.status)
        : passed ? 'passed'
          : row.subs.length > 0 ? 'completed'
            : row.invite && row.invite.status === 'used' ? 'in_progress'
              : 'invited'

      return {
        id: row.userId || email,
        name,
        role: (app && jobTitleById.get(app.job_id)) || '',
        scores,
        composite,
        status,
      }
    })

    data.sort((a, b) => b.composite - a.composite || String(a.name || '').localeCompare(String(b.name || '')))

    const funnel = {
      invited: invites.length,
      completed: [...rows.values()].filter(r => r.subs.length > 0).length,
      passed: [...rows.values()].filter(r => r.subs.some((s: any) => s.passed === true)).length,
      candidates: rows.size,
    }

    // Paged output (?page=&limit=, default first 1,000 rows by composite score).
    const sp = req.nextUrl.searchParams
    const limit = Math.min(1000, Math.max(1, Number(sp.get('limit')) || 1000))
    const page = Math.max(1, Number(sp.get('page')) || 1)
    return NextResponse.json({
      data: data.slice((page - 1) * limit, page * limit),
      funnel,
      total: data.length,
      page,
      has_more: page * limit < data.length,
      truncated: submissions.length >= MAX_DOCS || invites.length >= MAX_DOCS,
    })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
