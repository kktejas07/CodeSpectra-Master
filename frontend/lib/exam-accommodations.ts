/**
 * Extended-time accommodations: the test's author / tenant admin / superadmin grants a
 * candidate +25 %, +50 % or a custom amount (percent or minutes) with a reason. The grant is
 * copied onto the candidate's attempt draft (`time_accommodation`), so every server-side
 * timer — start, save, submit, sections, CAD, the abandoned-attempt sweep — applies it
 * (lib/exam-access attemptDeadlineMs / attemptTimeState). Every change is appended to
 * `exam_accommodation_audit` (who, when, before → after, reason) and the admin audit log.
 */
import type { Db } from 'mongodb'
import type { TimeAccommodation } from '@/lib/exam-access'

export interface AccommodationDoc {
  exam_id: string
  user_id: string
  percent: number | null
  extra_minutes: number | null
  reason: string
  active: boolean
  granted_by: string
  granted_at: string
  revoked_by?: string | null
  revoked_at?: string | null
}

export type GrantInput =
  | { kind: 'percent'; percent: number; reason: string }
  | { kind: 'minutes'; extra_minutes: number; reason: string }

/** Validate a grant (pure). +25 / +50 are the usual choices; custom is 1–300 % or 1–600 min. */
export function parseGrant(raw: unknown): { ok: true; grant: GrantInput } | { ok: false; code: 'accommodation_invalid' | 'accommodation_reason_required' } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const reason = typeof r.reason === 'string' ? r.reason.trim().slice(0, 300) : ''
  if (reason.length < 3) return { ok: false, code: 'accommodation_reason_required' }
  if (r.kind === 'percent') {
    const p = Number(r.percent)
    return Number.isInteger(p) && p >= 1 && p <= 300 ? { ok: true, grant: { kind: 'percent', percent: p, reason } } : { ok: false, code: 'accommodation_invalid' }
  }
  if (r.kind === 'minutes') {
    const m = Number(r.extra_minutes)
    return Number.isInteger(m) && m >= 1 && m <= 600 ? { ok: true, grant: { kind: 'minutes', extra_minutes: m, reason } } : { ok: false, code: 'accommodation_invalid' }
  }
  return { ok: false, code: 'accommodation_invalid' }
}

let indexed = false
async function col(db: Db) {
  const c = db.collection<AccommodationDoc>('exam_accommodations')
  if (!indexed) {
    indexed = true
    await Promise.all([
      c.createIndex({ exam_id: 1, user_id: 1 }, { unique: true, name: 'exam_acc_exam_user' }),
      db.collection('exam_accommodation_audit').createIndex({ exam_id: 1, at: -1 }, { name: 'exam_acc_audit_exam' }),
    ]).catch(() => { indexed = false })
  }
  return c
}

const toAcc = (d: Pick<AccommodationDoc, 'percent' | 'extra_minutes'>): TimeAccommodation => (d.percent ? { percent: d.percent } : { extra_minutes: d.extra_minutes })

/** The active grant for a candidate, as stored on the draft. */
export async function activeAccommodation(db: Db, examId: string, userId: string): Promise<TimeAccommodation | null> {
  const d = await (await col(db)).findOne({ exam_id: examId, user_id: userId, active: true }, { projection: { _id: 0, percent: 1, extra_minutes: 1 } })
  return d ? toAcc(d) : null
}

export async function listAccommodations(db: Db, examId: string): Promise<{ grants: AccommodationDoc[]; audit: Record<string, unknown>[] }> {
  const [grants, audit] = await Promise.all([
    (await col(db)).find({ exam_id: examId }, { projection: { _id: 0 } }).sort({ granted_at: -1 }).limit(500).toArray(),
    db.collection('exam_accommodation_audit').find({ exam_id: examId }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(200).toArray(),
  ])
  return { grants: grants as AccommodationDoc[], audit }
}

async function audit(db: Db, row: Record<string, unknown>) {
  await db.collection('exam_accommodation_audit').insertOne({ ...row, at: new Date().toISOString() })
}

/** Grant / change. Also stretches an attempt already in progress. */
export async function grantAccommodation(db: Db, examId: string, userId: string, g: GrantInput, actorId: string): Promise<AccommodationDoc> {
  const c = await col(db)
  const before = await c.findOne({ exam_id: examId, user_id: userId }, { projection: { _id: 0 } })
  const now = new Date().toISOString()
  const doc: AccommodationDoc = {
    exam_id: examId,
    user_id: userId,
    percent: g.kind === 'percent' ? g.percent : null,
    extra_minutes: g.kind === 'minutes' ? g.extra_minutes : null,
    reason: g.reason,
    active: true,
    granted_by: actorId,
    granted_at: now,
    revoked_by: null,
    revoked_at: null,
  }
  await c.replaceOne({ exam_id: examId, user_id: userId }, doc, { upsert: true })
  await db.collection('exam_drafts').updateMany({ exam_id: examId, user_id: userId, $or: [{ submitted_at: { $exists: false } }, { submitted_at: null }] }, { $set: { time_accommodation: toAcc(doc) } })
  await audit(db, { exam_id: examId, user_id: userId, action: before?.active ? 'changed' : 'granted', actor: actorId, before: before ? { percent: before.percent, extra_minutes: before.extra_minutes, active: before.active } : null, after: { percent: doc.percent, extra_minutes: doc.extra_minutes }, reason: g.reason })
  return doc
}

export async function revokeAccommodation(db: Db, examId: string, userId: string, actorId: string, reason: string): Promise<boolean> {
  const c = await col(db)
  const before = await c.findOne({ exam_id: examId, user_id: userId, active: true }, { projection: { _id: 0 } })
  if (!before) return false
  const now = new Date().toISOString()
  await c.updateOne({ exam_id: examId, user_id: userId }, { $set: { active: false, revoked_by: actorId, revoked_at: now } })
  await db.collection('exam_drafts').updateMany({ exam_id: examId, user_id: userId, $or: [{ submitted_at: { $exists: false } }, { submitted_at: null }] }, { $set: { time_accommodation: null } })
  await audit(db, { exam_id: examId, user_id: userId, action: 'revoked', actor: actorId, before: { percent: before.percent, extra_minutes: before.extra_minutes, active: true }, after: null, reason: reason.slice(0, 300) })
  return true
}
