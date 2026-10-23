/**
 * "Export my data" (SEC-040): everything held about a person, not only the
 * profile — built from the same collection list as account deletion
 * (lib/account-purge.ts) plus the activity records deletion keeps or doesn't
 * list (submissions, attempts, results, orders, tickets …).
 *
 * Own rows only (each source's filter is the person's id), secrets and file
 * bytes are stripped (tokens, hashes, OTPs, storage keys, inline blobs).
 */
import type { Db } from 'mongodb'
import { accountPurgePlan } from './account-purge'

export interface ExportSource {
  collection: string
  filter: Record<string, unknown>
}

/** Purge-plan collections that are account plumbing, not personal content. */
const PLUMBING = new Set([
  'user_sessions', 'email_change_otps', 'id_card_tokens', 'device_fingerprints',
  'push_tokens', 'web_push_subscriptions', 'digest_sends', 'notification_deferred',
  'automation_events', 'guardian_report_log', 'mkt_products',
])

/** Activity records keyed by the person's id (user_id or the older userId). */
const ACTIVITY = [
  'submissions', 'exam_submissions', 'certification_attempts', 'company_test_attempts',
  'quiz_results', 'course_enrollments', 'course_progress', 'lesson_completions',
  'learning_progress', 'xp_events', 'user_streaks', 'ai_mock_sessions',
  'ai_fluency_sessions', 'arena_submissions', 'codeathon_registrations', 'job_applications',
  'support_tickets', 'billing_orders', 'billing_subscriptions', 'mkt_bookings',
  'user_calendar_events', 'referrals',
]

/** Rows per collection in one export (bounds memory; noted in the file). */
export const EXPORT_ROW_LIMIT = 5000

export function exportSources(uid: string): ExportSource[] {
  const out = new Map<string, ExportSource[]>()
  const add = (collection: string, filter: Record<string, unknown>) => {
    const list = out.get(collection) ?? []
    if (!list.some((s) => JSON.stringify(s.filter) === JSON.stringify(filter))) list.push({ collection, filter })
    out.set(collection, list)
  }
  for (const op of accountPurgePlan(uid)) {
    if (PLUMBING.has(op.collection)) continue
    // Only filters on the person's own id (not derived ones like status: 'active').
    const own = Object.fromEntries(Object.entries(op.filter).filter(([, v]) => v === uid))
    if (Object.keys(own).length) add(op.collection, own)
  }
  for (const c of ACTIVITY) add(c, { $or: [{ user_id: uid }, { userId: uid }] })
  return [...out.values()].flat()
}

const SECRET_KEY = /(secret|password|passwd|api_?key|s3_key|private_key|totp|signature|face_template|embedding)|(^|_)(hash|otp|otps|token)(_|$)/i

/** Drop secrets and raw bytes; keeps the rest of the row as stored. */
export function sanitizeExportValue(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v !== 'object') return v
  if (ArrayBuffer.isView(v) || (v as { _bsontype?: string })._bsontype === 'Binary') return '[file omitted]'
  if (depth > 8) return '[nested]'
  if (Array.isArray(v)) return v.map((x) => sanitizeExportValue(x, depth + 1))
  if ((v as { _bsontype?: string })._bsontype) return String(v)
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === '_id' || SECRET_KEY.test(k)) continue
    if (k === 'data' && (ArrayBuffer.isView(val) || (val as { _bsontype?: string } | null)?._bsontype === 'Binary')) continue
    out[k] = sanitizeExportValue(val, depth + 1)
  }
  return out
}

/** Collect every source; a failing collection is listed, never fatal. */
export async function buildAccountExport(db: Db, uid: string): Promise<{ data: Record<string, unknown[]>; truncated: string[]; failed: string[] }> {
  const data: Record<string, unknown[]> = {}
  const truncated: string[] = []
  const failed: string[] = []
  for (const s of exportSources(uid)) {
    try {
      const rows = await db.collection(s.collection).find(s.filter).limit(EXPORT_ROW_LIMIT + 1).toArray()
      if (rows.length > EXPORT_ROW_LIMIT) truncated.push(s.collection)
      if (!rows.length) continue
      data[s.collection] = [...(data[s.collection] ?? []), ...rows.slice(0, EXPORT_ROW_LIMIT).map((r) => sanitizeExportValue(r))]
    } catch {
      failed.push(s.collection)
    }
  }
  return { data, truncated, failed }
}
