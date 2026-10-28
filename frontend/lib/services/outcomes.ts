/**
 * Hiring outcomes (bulk status / rating update). Extracted from
 * POST /api/admin/hiring-outcomes — the route and the admin agent call
 * recordHiringOutcomes, so history, tenant checks and rules are identical.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { isExamStaff } from '@/lib/exam-access'
import { ensureOutcomeIndexes, OUTCOMES_COLLECTION, type OutcomeStatus, type OutcomeUpdate } from '@/lib/hiring-outcomes'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

export interface OutcomeWriteResult {
  ok: true
  updated: string[]
  skipped: Array<{ user_id: string; reason: string }>
}

/** `update` must come from parseOutcomeUpdate (lib/hiring-outcomes). */
export async function recordHiringOutcomes(user: ServiceUser, update: OutcomeUpdate): Promise<ServiceResult<OutcomeWriteResult>> {
  const { exam_id, user_ids, status, rating } = update
  const db = await getMongoDb()
  if (!exam_id) return fail(400, 'id required')
  const exam = await db.collection('exams').findOne({ id: exam_id })
  if (!exam) return fail(404, 'Not found')
  if (!isExamStaff(user, exam)) return fail(403, 'Forbidden - resource belongs to another tenant')
  await ensureOutcomeIndexes(db)

  // Only candidates who took this test.
  const subs = await db.collection('exam_submissions')
    .find({ exam_id, user_id: { $in: user_ids } }, { projection: { _id: 0, user_id: 1, email: 1 } }).toArray()
  const emailByUser = new Map(subs.map((s) => [String(s.user_id), String(s.email || '')]))
  const existing = new Map((await db.collection(OUTCOMES_COLLECTION)
    .find({ exam_id, user_id: { $in: user_ids } }, { projection: { _id: 0 } }).toArray()).map((d) => [String(d.user_id), d]))

  const at = nowIso()
  const by = { by: user.id, by_email: user.email || '' }
  const updated: string[] = []
  const skipped: Array<{ user_id: string; reason: string }> = []

  for (const uid of user_ids) {
    if (!emailByUser.has(uid)) { skipped.push({ user_id: uid, reason: 'No submission for this test' }); continue }
    const prev = existing.get(uid) as Record<string, unknown> | undefined
    const prevStatus = (prev?.status as OutcomeStatus | undefined) ?? null
    const nextStatus = status ?? prevStatus
    if (rating && nextStatus !== 'hired') { skipped.push({ user_id: uid, reason: 'Ratings are for hired candidates' }); continue }
    if (!status && !rating) continue

    const set: Record<string, unknown> = { updated_at: at, email: emailByUser.get(uid) }
    const history: Record<string, unknown>[] = []
    if (status && status !== prevStatus) {
      set.status = status
      history.push({ at, ...by, kind: 'status', from: prevStatus, to: status })
    }
    if (rating) {
      const key = `d${rating.period}`
      const prevRating = (prev?.ratings as Record<string, { value?: number }> | undefined)?.[key]
      set[`ratings.${key}`] = { value: rating.value, ...(rating.notes ? { notes: rating.notes } : {}), ...by, at }
      history.push({ at, ...by, kind: 'rating', period: rating.period, from: prevRating?.value ?? null, to: rating.value, ...(rating.notes ? { notes: rating.notes } : {}) })
    }
    if (history.length === 0) continue
    await db.collection(OUTCOMES_COLLECTION).updateOne(
      { exam_id, user_id: uid },
      {
        $set: set,
        $setOnInsert: { id: newId(), exam_id, user_id: uid, tenant_id: exam.tenant_id ?? null, created_at: at },
        $push: { history: { $each: history, $slice: -200 } },
      } as never,
      { upsert: true },
    )
    updated.push(uid)
  }
  return ok({ ok: true as const, updated, skipped })
}
