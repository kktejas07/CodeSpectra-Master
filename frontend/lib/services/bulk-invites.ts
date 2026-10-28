/**
 * Bulk candidate invites for one assessment (audits CORE-009 / CORE-010).
 *
 *  - Superadmins and company admins (their own tenant's tests only) can invite
 *    up to MAX_BULK_ROWS candidates per request — CSV upload or pasted emails.
 *  - Plan aware: a company's invites count against `max_candidate_invites_per_month`.
 *  - The request only validates and stores invites (insertMany, delivery_status
 *    'queued'); e-mails go out from a queue drained right after the request and
 *    by the per-minute scheduler, so a large batch never hits a proxy timeout
 *    and a crash mid-way leaves invites queued, not lost.
 *  - Each invite carries its own status: queued → sending → sent | failed
 *    (a transient failure is retried by the e-mail outbox).
 *
 * The single "invited link" path (/api/exams/[id]/links) sends through
 * sendInviteEmail too and shares the plan cap (lib/services/invite-quota.ts).
 */
import 'server-only'
import type { Db } from 'mongodb'
import type { RowError } from '@/lib/assessment-invite-rows'
import { escapeHtml } from '@/lib/org-invitations-core'
import { newId, nowIso } from '@/lib/db/ids'

export const MAX_BULK_ROWS = 500
export const DEFAULT_INVITE_TTL_MS = 7 * 86_400_000
/** A row stuck in 'sending' this long (process died mid-send) goes back to the queue. */
const STALE_SENDING_MS = 10 * 60_000

export { splitCsvLine, parseCandidateText, validateRows, type CandidateRow, type RowError } from '@/lib/assessment-invite-rows'
import { validateRows } from '@/lib/assessment-invite-rows'

export function inviteUrlFor(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/assessment/invite/${token}`
}

/** The invite e-mail (names and the recruiter note are escaped). */
export async function inviteEmail(p: { name: string; examTitle: string; token: string; expiresAt: string; message?: string | null; email?: string | null }) {
  const { emailLongDate, emailTemplatesFor } = await import('@/lib/email-templates')
  // The candidate's language when the address belongs to an account with one set; else English.
  const { localeForEmail } = await import('@/lib/i18n/recipient')
  const locale = await localeForEmail(p.email)
  const tpl = emailTemplatesFor(locale).assessmentInvite({
    candidateName: escapeHtml(p.name),
    examTitle: escapeHtml(p.examTitle),
    inviteUrl: inviteUrlFor(p.token),
    expiresIn: emailLongDate(p.expiresAt, locale),
  })
  if (p.message) tpl.html = tpl.html.replace('</h1>', `</h1><p style="margin:12px 0 0;font-size:14px;white-space:pre-line">${escapeHtml(p.message)}</p>`)
  return { subject: tpl.subject.replace(/[\r\n]+/g, ' '), html: tpl.html }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface BulkInviteInput {
  exam: { id: string; title?: unknown; tenant_id?: unknown }
  actor: { id: string; role: string; tenantId?: string | null }
  candidates: unknown
  deadline?: unknown
  durationMinutes?: unknown
  message?: unknown
}

export type BulkInviteResult =
  | { ok: true; batch_id: string; created: Array<{ id: string; email: string; delivery_status: 'queued' }>; errors: RowError[] }
  | { ok: false; status: number; error: string; code?: string; limit?: number; remaining?: number }

export async function createBulkInvites(db: Db, input: BulkInviteInput): Promise<BulkInviteResult> {
  const rows = Array.isArray(input.candidates) ? input.candidates : []
  if (!rows.length) return { ok: false, status: 400, error: 'Add at least one candidate.' }
  if (rows.length > MAX_BULK_ROWS) return { ok: false, status: 400, error: `Up to ${MAX_BULK_ROWS} candidates per batch. Split the list and send the rest in another batch.` }

  let expiresAt = new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString()
  if (input.deadline !== undefined && input.deadline !== null && input.deadline !== '') {
    const t = Date.parse(String(input.deadline))
    if (!Number.isFinite(t) || t < Date.now()) return { ok: false, status: 400, error: 'The deadline must be a future date.' }
    expiresAt = new Date(t).toISOString()
  }
  const duration = input.durationMinutes === undefined || input.durationMinutes === null || input.durationMinutes === '' ? null : Number(input.durationMinutes)
  if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) return { ok: false, status: 400, error: 'Duration must be 1–1440 minutes.' }
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 1000) : ''

  const examId = input.exam.id
  const col = db.collection('candidate_invites')
  const emails = rows.map((r) => (r && typeof r === 'object' && typeof (r as { email?: unknown }).email === 'string' ? (r as { email: string }).email.trim().toLowerCase() : '')).filter(Boolean)
  const existing = await col.find(
    { email: { $in: emails.slice(0, MAX_BULK_ROWS) }, $or: [{ exam_id: examId }, { exam_ids: examId }, { target_url: `/assessment/${examId}` }], status: { $in: ['pending', 'active', 'used'] } },
    { projection: { _id: 0, email: 1 } },
  ).toArray()
  const { valid, errors } = validateRows(rows, new Set(existing.map((e) => String(e.email))))
  if (!valid.length) return { ok: true, batch_id: '', created: [], errors }

  // Plan limit (companies only) — atomic reservation on the monthly counter (W4-17).
  const tenantId = typeof input.exam.tenant_id === 'string' && input.exam.tenant_id ? input.exam.tenant_id : null
  const { reserveInviteQuota, releaseInviteQuota } = await import('@/lib/services/invite-quota')
  const quota = await reserveInviteQuota(db, { tenantId, actorRole: input.actor.role, count: valid.length })
  if (!quota.ok) return { ok: false, status: quota.status, code: quota.code, limit: quota.limit, remaining: quota.remaining, error: quota.error }

  const now = nowIso()
  const batchId = newId()
  const docs = valid.map((c) => ({
    id: newId(),
    token: crypto.randomUUID(), // unguessable: the candidate's key to the test
    user_id: '',
    email: c.email,
    full_name: c.name || c.email.split('@')[0],
    target_url: `/assessment/${examId}`,
    exam_id: examId,
    exam_ids: [examId],
    assigned_assessments: [],
    allowed_languages: [],
    invited_by: input.actor.id,
    ...(tenantId ? { tenant_id: tenantId } : {}),
    status: 'pending' as const,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
    company: c.company || null,
    role_title: c.role || null,
    duration_minutes: duration,
    custom_message: message || null,
    bulk_scheduled: true,
    batch_id: batchId,
    delivery_status: 'queued' as const,
    delivery_next_at: now,
  }))
  try {
    await col.insertMany(docs, { ordered: false })
  } catch (e) {
    // Give back the seats of rows that were not stored.
    const stored = Number((e as { result?: { insertedCount?: number }; insertedCount?: number })?.insertedCount ?? (e as { result?: { insertedCount?: number } })?.result?.insertedCount ?? 0)
    await releaseInviteQuota(db, quota, docs.length - stored)
    throw e
  }
  return { ok: true, batch_id: batchId, created: docs.map((d) => ({ id: d.id, email: d.email, delivery_status: 'queued' as const })), errors }
}

// ─── Send ───────────────────────────────────────────────────────────────────

type InviteDoc = { id: string; email: string; full_name?: string; token: string; expires_at: string; exam_id: string; custom_message?: string | null }

/** Send one stored invite's e-mail and record the outcome on it. */
export async function sendInviteEmail(db: Db, invite: InviteDoc, examTitle: string): Promise<'sent' | 'failed'> {
  const col = db.collection('candidate_invites')
  let status: 'sent' | 'failed' = 'failed'
  let error: string | null = null
  let postalId: number | null = null
  let queued = false
  try {
    const { sendEmail } = await import('@/lib/send-email')
    const r = await sendEmail(invite.email, await inviteEmail({
      email: invite.email,
      name: invite.full_name || invite.email.split('@')[0], examTitle: examTitle || 'Technical assessment',
      token: invite.token, expiresAt: invite.expires_at, message: invite.custom_message,
    }), undefined, { category: 'assessment_invite' })
    status = r.success ? 'sent' : 'failed'
    postalId = r.postalMessageId
    queued = !!r.queued
    error = r.success ? null : r.suppressed ? 'Address bounced earlier — not sent' : (r.error ? 'Email provider error' : 'Not sent')
  } catch {
    error = 'Email provider error'
  }
  await col.updateOne({ id: invite.id }, {
    $set: {
      delivery_status: status === 'sent' ? 'sent' : queued ? 'retrying' : 'failed',
      delivery_updated_at: nowIso(),
      delivery_error: error,
      ...(postalId ? { postal_message_id: postalId } : {}),
    },
    $unset: { delivery_next_at: '', delivery_claimed_at: '' },
  }).catch(() => {})
  return status
}

/**
 * Drain queued invite e-mails (bounded by `limit` and `budgetMs`). Each row is
 * claimed atomically, so concurrent drains (request + scheduler + another
 * replica) never send one twice. Returns how many were processed.
 */
export async function sendQueuedInvites(db: Db, opts: { limit?: number; budgetMs?: number; batchId?: string; now?: Date } = {}): Promise<number> {
  const col = db.collection('candidate_invites')
  const started = Date.now()
  const limit = opts.limit ?? 100
  const budget = opts.budgetMs ?? 25_000
  const titles = new Map<string, string>()
  let n = 0
  for (; n < limit && Date.now() - started < budget; n++) {
    const now = (opts.now ?? new Date()).toISOString()
    const staleBefore = new Date((opts.now ?? new Date()).getTime() - STALE_SENDING_MS).toISOString()
    const row = await col.findOneAndUpdate(
      {
        ...(opts.batchId ? { batch_id: opts.batchId } : {}),
        $or: [
          { delivery_status: 'queued', delivery_next_at: { $lte: now } },
          { delivery_status: 'sending', delivery_claimed_at: { $lt: staleBefore } },
        ],
      },
      { $set: { delivery_status: 'sending', delivery_claimed_at: now } },
      { sort: { delivery_next_at: 1 }, returnDocument: 'after', projection: { _id: 0 } },
    )
    if (!row) break
    const inv = row as unknown as InviteDoc
    if (!titles.has(inv.exam_id)) {
      const e = await db.collection('exams').findOne({ id: inv.exam_id }, { projection: { _id: 0, title: 1 } })
      titles.set(inv.exam_id, typeof e?.title === 'string' ? e.title : 'Technical assessment')
    }
    await sendInviteEmail(db, inv, titles.get(inv.exam_id)!)
  }
  return n
}

/** Per-invite delivery status for a batch (the page polls this). */
export async function batchStatus(db: Db, examId: string, batchId: string) {
  const rows = await db.collection('candidate_invites')
    .find({ exam_id: examId, batch_id: batchId }, { projection: { _id: 0, id: 1, email: 1, delivery_status: 1, delivery_error: 1, status: 1 } })
    .limit(MAX_BULK_ROWS)
    .toArray()
  const counts: Record<string, number> = {}
  for (const r of rows) counts[String(r.delivery_status || 'queued')] = (counts[String(r.delivery_status || 'queued')] || 0) + 1
  return { invites: rows, counts }
}
