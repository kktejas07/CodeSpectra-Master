/**
 * SEC-037 follow-up: one-time sweep that takes learner-published problems out
 * of the public library (rules in ./learner-review-core.ts), plus the admin
 * approve action that puts one back.
 *
 * Idempotent and safe to re-run: it only matches problems that are still
 * published, never deletes, and a done-flag doc in `one_time_jobs` (keyed by
 * _id) stops it after the first successful run. Wired into the platform cron
 * (lib/platform-cron.ts), which claims the window in job_leases so only one
 * replica runs it.
 */
import { getMongoDb } from '@/lib/mongodb'
import { writeAuditLog } from '@/lib/db/misc'
import { knowledgeOnLibraryChange } from '@/lib/rag/hooks'
import {
  ONE_TIME_JOB_ID, PROBLEM_REVIEW_APPROVED, PROBLEM_REVIEW_PENDING,
  auditDetail, creatorIds, problemKnowledgeId, selectLearnerProblems, type ProblemAuthorRow,
} from './learner-review-core'

const CHUNK = 500
let doneInProcess = false

/** True once the sweep has finished (cached per process after the first yes). */
export async function learnerProblemSweepDone(): Promise<boolean> {
  if (doneInProcess) return true
  const db = await getMongoDb()
  const flag = await db.collection<{ _id: string }>('one_time_jobs').findOne({ _id: ONE_TIME_JOB_ID }, { projection: { _id: 1 } })
  if (flag) doneInProcess = true
  return doneInProcess
}

/** Tests only. */
export function __resetLearnerSweepCache(): void { doneInProcess = false }

export async function runLearnerProblemSweep(now: Date = new Date()): Promise<{ count: number; skipped: boolean }> {
  if (await learnerProblemSweepDone()) return { count: 0, skipped: true }
  const db = await getMongoDb()
  const rows = (await db.collection('problems')
    .find(
      { is_published: { $ne: false }, created_by: { $type: 'string', $ne: '' }, visibility: { $ne: 'hackathon_only' } },
      { projection: { _id: 1, id: 1, slug: 1, created_by: 1, is_published: 1, visibility: 1 } },
    )
    .toArray()) as unknown as ProblemAuthorRow[]

  const roles = new Map<string, string | null>()
  const ids = creatorIds(rows)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK)
    const users = await db.collection('user')
      .find({ $or: [{ _id: { $in: part as never[] } }, { id: { $in: part } }] }, { projection: { _id: 1, id: 1, role: 1 } })
      .toArray()
    for (const u of users) {
      const role = typeof u.role === 'string' ? u.role : null
      roles.set(String(u._id), role)
      if (typeof u.id === 'string' && u.id) roles.set(u.id, role)
    }
  }

  const picked = selectLearnerProblems(rows, roles)
  const nowIso = now.toISOString()
  for (let i = 0; i < picked.length; i += CHUNK) {
    const part = picked.slice(i, i + CHUNK)
    // Re-check is_published in the filter so a concurrent admin edit is never overwritten twice.
    await db.collection('problems').updateMany(
      { _id: { $in: part.map((r) => r._id) as never[] }, is_published: { $ne: false } },
      { $set: { is_published: false, review_status: PROBLEM_REVIEW_PENDING, review_reason: 'sec037_learner_authored', review_requested_at: nowIso, updated_at: nowIso } },
    )
  }
  const knowledgeIds = picked.map(problemKnowledgeId).filter((x): x is string => !!x)
  // Unpublished → the loader returns null → removed from the index at once (RAG-024).
  for (let i = 0; i < knowledgeIds.length; i += 200) knowledgeOnLibraryChange('problem', knowledgeIds.slice(i, i + 200))

  await writeAuditLog({
    action: 'problems.learner_unpublish',
    outcome: 'success',
    actor: 'system',
    actorIp: '',
    resource: ONE_TIME_JOB_ID,
    resourceType: 'problem',
    severity: 'warning',
    detail: auditDetail(knowledgeIds),
    user_id: 'system',
  })
  // Done flag last: a crash before here re-runs the (idempotent) sweep on the next tick.
  await db.collection<{ _id: string }>('one_time_jobs').updateOne(
    { _id: ONE_TIME_JOB_ID },
    { $set: { done_at: nowIso, count: picked.length } },
    { upsert: true },
  )
  doneInProcess = true
  return { count: picked.length, skipped: false }
}

export interface PendingProblemRow {
  id: string
  slug: string
  title: string
  difficulty: string
  topics: string[]
  review_status: string | null
  review_requested_at: string | null
  created_at: string | null
  creator_exists: boolean
}

/** Admin list: problems waiting for review (newest first). No creator PII. */
export async function listPendingReviewProblems(limit = 200): Promise<PendingProblemRow[]> {
  const db = await getMongoDb()
  const rows = await db.collection('problems')
    .find({ review_status: PROBLEM_REVIEW_PENDING, is_published: false }, { projection: { _id: 0, id: 1, slug: 1, title: 1, difficulty: 1, topics: 1, review_status: 1, review_requested_at: 1, created_at: 1, created_by: 1 } })
    .sort({ review_requested_at: -1, created_at: -1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .toArray()
  const creators = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => typeof x === 'string' && !!x))]
  const existing = new Set<string>()
  if (creators.length) {
    const users = await db.collection('user').find({ $or: [{ _id: { $in: creators as never[] } }, { id: { $in: creators } }] }, { projection: { _id: 1, id: 1 } }).toArray()
    for (const u of users) { existing.add(String(u._id)); if (typeof u.id === 'string') existing.add(u.id) }
  }
  return rows.map((r) => ({
    id: String(r.id || r.slug || ''),
    slug: String(r.slug || r.id || ''),
    title: String(r.title || ''),
    difficulty: String(r.difficulty || ''),
    topics: Array.isArray(r.topics) ? r.topics.map(String).slice(0, 8) : [],
    review_status: typeof r.review_status === 'string' ? r.review_status : null,
    review_requested_at: typeof r.review_requested_at === 'string' ? r.review_requested_at : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
    creator_exists: typeof r.created_by === 'string' && existing.has(r.created_by),
  }))
}

/** Approve: republish and re-index. Returns the knowledge id, or null when not pending. */
export async function approvePendingProblem(idOrSlug: string, adminId: string, now: Date = new Date()): Promise<string | null> {
  const db = await getMongoDb()
  const nowIso = now.toISOString()
  const doc = await db.collection('problems').findOneAndUpdate(
    { $or: [{ id: idOrSlug }, { slug: idOrSlug }], review_status: PROBLEM_REVIEW_PENDING },
    { $set: { is_published: true, review_status: PROBLEM_REVIEW_APPROVED, reviewed_by: adminId, reviewed_at: nowIso, updated_at: nowIso } },
    { returnDocument: 'after', projection: { _id: 0, id: 1, slug: 1 } },
  )
  if (!doc) return null
  const kid = problemKnowledgeId(doc as { id?: string; slug?: string })
  if (kid) knowledgeOnLibraryChange('problem', kid)
  return kid
}
