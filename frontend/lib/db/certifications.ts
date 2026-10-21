/**
 * Certification attempts data model + repository helpers.
 *
 * This module powers VERIFIABLE certificates issued through three paths:
 *   1. Admin manual issuance (superadmin "Issue Certificate"),
 *   2. Automatic level-up XP certificates (`xp-service.ts`),
 *   3. (Historically) self-built quiz assessments — removed; the user-facing
 *      certifications page now curates real vendor prep + free credentials
 *      (see `lib/cert-catalog.ts`).
 *
 * All paths write to the shared `certification_attempts` collection so the
 * public verify page (`/cert/verify/[token]` + `/api/certifications/verify`),
 * SVG download, and certificate templates work uniformly.
 *
 * Collection: certification_attempts — per-user attempts with score + verify token.
 */
import { randomBytes } from 'node:crypto'
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from './ids'

const newToken = (): string =>
  randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export interface CertificationAttemptDoc {
  id: string
  user_id: string
  certification_id: string
  /** base64url token used in the public /cert/verify URL. */
  verify_token: string
  started_at: string
  submitted_at?: string | null
  score: number
  passed: boolean
  /** snapshot of the user (so verify still works if the user is deleted). */
  snapshot: { name?: string; email?: string }
  cert_snapshot: { title: string; level: string; source: string }
  /** Optional override for the score line (e.g. "+420 XP earned" on level-up certs). */
  score_label?: string
  template?: string
  event_title?: string | null
  /** One-per-learner key for auto-issued certificates (e.g. `course:<id>:<user>`); unique when set. */
  issue_key?: string
  /** Set by an admin to invalidate a certificate; the public verify page then shows "revoked". */
  revoked_at?: string | null
  /** User id of the superadmin who revoked it. */
  revoked_by?: string | null
  /** Why it was revoked (admin-facing; never shown on the public page). */
  revoke_reason?: string | null
  /** Exam submission this certificate was issued for, when issued for one. */
  exam_submission_id?: string | null
}

async function db() {
  return getMongoDb()
}

export async function certificationAttempts(): Promise<Collection<CertificationAttemptDoc>> {
  return (await db()).collection<CertificationAttemptDoc>('certification_attempts')
}

export function newAttemptToken(): string {
  return newToken()
}

export function newAttemptId(): string {
  return newId()
}

export function nowIsoString(): string {
  return nowIso()
}

/**
 * Unique index on `issue_key` (only rows that set it), so course / codeathon
 * certificates stay one per learner even under concurrent requests.
 * Idempotent; the build runs once per process.
 */
let issuedIndex: Promise<unknown> | null = null
export function ensureIssuedCertificateIndex(): Promise<unknown> {
  if (!issuedIndex) {
    issuedIndex = certificationAttempts()
      .then((col) =>
        Promise.all([
          col.createIndex(
            { issue_key: 1 },
            { unique: true, name: 'cert_issue_key_unique', partialFilterExpression: { issue_key: { $exists: true } } },
          ),
          col.createIndex({ verify_token: 1 }, { name: 'cert_verify_token' }),
        ]),
      )
      .catch((e) => {
        issuedIndex = null
        console.error('[certifications] index build failed', e)
      })
  }
  return issuedIndex
}

/**
 * Verify tokens of live (not revoked) certificates that belong to the given
 * exam submissions of one user. A certificate belongs to a submission when it
 * records `exam_submission_id`, or — for certificates issued for the exam as a
 * whole (`certification_id` = exam id) — to that exam's most recent passed
 * submission. Returns submissionId -> verify_token.
 */
export async function certificateTokensForExamSubmissions(
  userId: string,
  submissions: Array<{ id: string; exam_id: string; passed: boolean; submitted_at?: string | null }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const subIds = submissions.map((s) => s.id).filter(Boolean)
  const examIds = [...new Set(submissions.map((s) => s.exam_id).filter(Boolean))]
  if (!userId || (!subIds.length && !examIds.length)) return out

  const rows = await (await certificationAttempts())
    .find(
      {
        user_id: userId,
        revoked_at: null, // matches missing or null
        $or: [{ exam_submission_id: { $in: subIds } }, { certification_id: { $in: examIds } }],
      } as Record<string, unknown>,
      { projection: { verify_token: 1, exam_submission_id: 1, certification_id: 1, submitted_at: 1 } },
    )
    .sort({ submitted_at: -1 })
    .toArray()

  const byExam = new Map<string, string>()
  for (const r of rows) {
    if (typeof r.verify_token !== 'string' || !r.verify_token) continue
    if (typeof r.exam_submission_id === 'string' && r.exam_submission_id) {
      if (!out.has(r.exam_submission_id)) out.set(r.exam_submission_id, r.verify_token)
    } else if (typeof r.certification_id === 'string' && !byExam.has(r.certification_id)) {
      byExam.set(r.certification_id, r.verify_token)
    }
  }

  if (byExam.size) {
    const latestPassed = new Map<string, { id: string; at: string }>()
    for (const s of submissions) {
      if (!s.passed || !byExam.has(s.exam_id)) continue
      const at = String(s.submitted_at || '')
      const cur = latestPassed.get(s.exam_id)
      if (!cur || at > cur.at) latestPassed.set(s.exam_id, { id: s.id, at })
    }
    for (const [examId, { id }] of latestPassed) {
      if (!out.has(id)) out.set(id, byExam.get(examId)!)
    }
    // An exam certificate earned on an earlier (archived) attempt still shows on
    // the exam's current row, even when the latest retake scored lower.
    const latestAny = new Map<string, { id: string; at: string }>()
    for (const s of submissions) {
      if (!byExam.has(s.exam_id) || latestPassed.has(s.exam_id)) continue
      const at = String(s.submitted_at || '')
      const cur = latestAny.get(s.exam_id)
      if (!cur || at > cur.at) latestAny.set(s.exam_id, { id: s.id, at })
    }
    for (const [examId, { id }] of latestAny) {
      if (!out.has(id)) out.set(id, byExam.get(examId)!)
    }
  }
  return out
}

// ─── Assessment (exam) certificates ──────────────────────────────────────────

type ExamDoc = Record<string, unknown>

const CERT_TEMPLATE_KEYS = new Set(['classic', 'modern', 'minimal', 'professional', 'corporate', 'academic'])

function percentOf(score: unknown, max: unknown): number | null {
  const s = Number(score)
  const m = Number(max)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)))
}

/** Stable key: one assessment certificate per candidate per exam (retakes never add a second). */
export const examCertificateIssueKey = (examId: string, userId: string): string => `exam:${examId}:${userId}`

export interface ExamCertificateResult {
  token: string
  /** true only when this call created the certificate (use it to notify once). */
  created: boolean
  /** Candidate has no platform account (invite-only); reach them by email instead of in-app. */
  inviteOnly?: boolean
  /** Holder name and email recorded on the certificate (email is never shown publicly). */
  holderName?: string
  holderEmail?: string
}

const looksLikeEmail = (v: string) => v.includes('@')

/**
 * Holder identity for an exam certificate. Platform users come from `user`;
 * invite-only candidates (`candidate_*` ids, or no account) from their
 * candidate_invites row, falling back to the submission's email.
 */
async function examHolder(
  db: Db,
  examId: string,
  userId: string,
  sub: ExamDoc,
): Promise<{ name: string; email: string; inviteOnly: boolean }> {
  const subEmail = typeof sub.email === 'string' ? sub.email.trim().toLowerCase() : ''
  if (!userId.startsWith('candidate_')) {
    const userDoc = await db.collection('user').findOne(
      { $or: [{ id: userId }, { _id: userId }] } as Record<string, unknown>,
      { projection: { name: 1, fullName: 1, email: 1 } },
    )
    if (userDoc) {
      const email = String(userDoc.email || subEmail || '')
      return {
        name: String(userDoc.fullName || userDoc.name || (email ? email.split('@')[0] : '') || 'Candidate'),
        email,
        inviteOnly: false,
      }
    }
  }
  // Prefer this exam's invite, then any invite for the same candidate.
  const or: Record<string, unknown>[] = [{ user_id: userId }]
  if (subEmail) or.push({ email: subEmail })
  const invites = await db.collection('candidate_invites')
    .find({ $or: or } as Record<string, unknown>, { projection: { full_name: 1, email: 1, exam_id: 1, target_url: 1, created_at: 1 } })
    .sort({ created_at: -1 })
    .limit(20)
    .toArray()
  const forExam = invites.find(
    (i) => i.exam_id === examId || (typeof i.target_url === 'string' && i.target_url.includes(`/assessment/${examId}`)),
  )
  const invite = forExam || invites[0]
  const email = String(invite?.email || subEmail || '').trim().toLowerCase()
  const rawName = String(invite?.full_name || sub.candidate_name || sub.full_name || '').trim()
  // Never put an email address on the public certificate.
  const name = rawName && !looksLikeEmail(rawName) ? rawName : (email ? email.split('@')[0] : 'Candidate')
  return { name: name.slice(0, 120), email, inviteOnly: true }
}

/**
 * Issue the assessment certificate for one candidate after their score is
 * released. Picks the best RELEASED attempt that meets `cutoff` — the current
 * submission (when released) or the archived `previous_best_released` — and
 * writes one certificate per (exam, user) keyed by `issue_key`. Idempotent:
 * repeat releases, retakes and concurrent calls return the existing row.
 *
 * Invite-only candidates (`candidate_*` ids / no account) get one too, named
 * from their invite; the result says `inviteOnly` so the caller emails them.
 *
 * Returns null when certificates are off for the exam or no released attempt passes.
 */
export async function issueExamCertificate(
  db: Db,
  exam: ExamDoc,
  sub: ExamDoc,
  cutoff: number,
): Promise<ExamCertificateResult | null> {
  if (exam.issue_certificates === false) return null
  const examId = String(exam.id || '')
  const userId = typeof sub.user_id === 'string' ? sub.user_id : ''
  if (!examId || !userId) return null

  const released = sub.score_released === true || !!sub.released_at
  const candidates: Array<{ pct: number; attemptNo: number; submissionId: string | null }> = []
  const curPct = released ? percentOf(sub.score, sub.max_score) : null
  if (curPct !== null && curPct >= cutoff) {
    candidates.push({ pct: curPct, attemptNo: Number(sub.attempt_no) || 1, submissionId: typeof sub.id === 'string' ? sub.id : null })
  }
  const prev = sub.previous_best_released as { score?: unknown; max_score?: unknown; attempt_no?: unknown } | null | undefined
  const prevPct = prev && typeof prev === 'object' ? percentOf(prev.score, prev.max_score) : null
  if (prevPct !== null && prevPct >= cutoff) {
    // Archived attempts have no live submission id; the exam-level lookup maps it.
    candidates.push({ pct: prevPct, attemptNo: Number(prev?.attempt_no) || 1, submissionId: null })
  }
  if (!candidates.length) return null
  // Best score wins; on a tie keep the earlier attempt.
  const best = candidates.sort((a, b) => b.pct - a.pct || a.attemptNo - b.attemptNo)[0]

  const col = await certificationAttempts()
  const issueKey = examCertificateIssueKey(examId, userId)

  // An admin may already have issued one by hand for this exam — don't add a second.
  const existing = await col.findOne(
    { user_id: userId, $or: [{ issue_key: issueKey }, { certification_id: examId, passed: true }] } as Record<string, unknown>,
    { projection: { verify_token: 1 } },
  )
  if (existing?.verify_token) return { token: existing.verify_token, created: false }

  const holder = await examHolder(db, examId, userId, sub)
  const template = typeof exam.cert_template === 'string' && CERT_TEMPLATE_KEYS.has(exam.cert_template) ? exam.cert_template : undefined

  const now = nowIso()
  const doc: CertificationAttemptDoc & { attempt_no: number } = {
    id: newId(),
    user_id: userId,
    certification_id: examId,
    issue_key: issueKey,
    verify_token: newToken(),
    started_at: typeof sub.started_at === 'string' ? sub.started_at : now,
    submitted_at: now,
    // The public verify route turns this into a coarse band; the exact score is never shown.
    score: best.pct,
    passed: true,
    // The public verify route returns only `snapshot.name`; the email stays private.
    snapshot: { name: holder.name, ...(holder.email ? { email: holder.email } : {}) },
    cert_snapshot: {
      title: String(exam.title || 'Assessment'),
      level: String(exam.level || exam.difficulty_level || 'Assessment'),
      source: 'CodeSpectra assessment',
    },
    exam_submission_id: best.submissionId,
    attempt_no: best.attemptNo,
    ...(template ? { template } : {}),
  }

  await ensureIssuedCertificateIndex()
  let created = false
  try {
    const res = await col.updateOne({ issue_key: issueKey }, { $setOnInsert: doc }, { upsert: true })
    created = res.upsertedCount > 0
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  const who = { inviteOnly: holder.inviteOnly, holderName: holder.name, holderEmail: holder.email }
  if (created) return { token: doc.verify_token, created: true, ...who }
  const saved = await col.findOne({ issue_key: issueKey }, { projection: { verify_token: 1 } })
  return saved?.verify_token ? { token: saved.verify_token, created: false, ...who } : null
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Tell the candidate about a certificate this call just created (no-op otherwise,
 * so every issue path notifies exactly once). Platform users get the in-app
 * notification; invite-only candidates can't see those, so they get a short
 * email with the public verify link. Never throws.
 */
export async function deliverExamCertificate(
  exam: ExamDoc,
  userId: string,
  cert: ExamCertificateResult | null,
): Promise<void> {
  if (!cert?.created) return
  const examTitle = String(exam.title || 'Assessment')
  const path = `/cert/verify/${cert.token}`
  void import('@/lib/automation/events').then(({ emit }) => emit('certificate.issued', {
    user_id: userId, title: examTitle, verify_url: path, issued_at: nowIso(),
  }, { tenantId: typeof exam.tenant_id === 'string' ? exam.tenant_id : null, idempotencyKey: `certificate.issued:${cert.token}` })).catch((e) => console.error('[automation] emit failed:', e))
  try {
    if (!cert.inviteOnly) {
      const { notify } = await import('@/lib/notifications')
      await notify({
        user_id: userId,
        type: 'assessment.certificate_issued',
        title: `You earned a certificate for "${examTitle}"`,
        message: 'Your certificate is ready to view and share. Anyone can verify it from its link.',
        link: path,
      })
      return
    }
    const to = cert.holderEmail || ''
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return
    // Belt and braces against a flood to one inbox (creation is already once per exam + candidate).
    const { rateLimitSlidingWindow } = await import('@/lib/in-memory-rate-limit')
    if (!rateLimitSlidingWindow(`cert-email:${to}`, 10, 60 * 60_000).ok) return
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const url = `${base}${path}`
    const title = escapeHtml(examTitle)
    const html = [
      `<p>Hi ${escapeHtml(cert.holderName || 'there')},</p>`,
      `<p>You passed ${title} and your certificate is ready.</p>`,
      `<p>View and share it here: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
      '<p>Anyone with this link can check that it is genuine.</p>',
      '<p>CodeSpectra</p>',
    ].join('')
    const { sendEmail } = await import('@/lib/send-email')
    await sendEmail(to, { subject: `Your CodeSpectra certificate for ${examTitle}`, html })
  } catch (e) {
    console.error('[certifications] certificate delivery failed:', userId, e)
  }
}

/** A released attempt (current or archived best) at or above `cutoff`. */
function hasPassingReleasedAttempt(sub: ExamDoc, cutoff: number): boolean {
  const released = sub.score_released === true || !!sub.released_at
  const cur = released ? percentOf(sub.score, sub.max_score) : null
  if (cur !== null && cur >= cutoff) return true
  const prev = sub.previous_best_released as { score?: unknown; max_score?: unknown } | null | undefined
  const prevPct = prev && typeof prev === 'object' ? percentOf(prev.score, prev.max_score) : null
  return prevPct !== null && prevPct >= cutoff
}

export interface ExamBackfillCounts {
  /** Released submissions with a passing attempt that were looked at. */
  checked: number
  /** Certificates created by this run. */
  issued: number
  /** Already had a certificate (left as is). */
  existing: number
  failed: number
}

/**
 * Issue any missing certificates for released, passing submissions — for one
 * exam (admin backfill), optionally limited to one user (lazy issue on load).
 * Uses the exam's pass mark (`cutoff`, from examPassPercent) and the same
 * idempotent issueExamCertificate, and notifies only on first issue.
 * Users who already hold this exam's certificate are skipped in one query.
 */
export async function issueMissingExamCertificates(
  db: Db,
  exam: ExamDoc,
  cutoff: number,
  opts: { userId?: string; submissions?: ExamDoc[] } = {},
): Promise<ExamBackfillCounts> {
  const counts: ExamBackfillCounts = { checked: 0, issued: 0, existing: 0, failed: 0 }
  const examId = String(exam.id || '')
  if (!examId || exam.issue_certificates === false) return counts

  const subs = opts.submissions
    ? opts.submissions.filter((s) => s.exam_id === examId)
    : ((await db.collection('exam_submissions')
        .find(
          {
            exam_id: examId,
            ...(opts.userId ? { user_id: opts.userId } : {}),
            $or: [{ score_released: true }, { released_at: { $nin: [null, ''] } }],
          } as Record<string, unknown>,
          { projection: { _id: 0, answers: 0, questions: 0, code_submissions: 0 } },
        )
        .limit(5000)
        .toArray()) as ExamDoc[])

  const passing = subs.filter((s) => typeof s.user_id === 'string' && s.user_id && hasPassingReleasedAttempt(s, cutoff))
  if (!passing.length) return counts

  const userIds = [...new Set(passing.map((s) => String(s.user_id)))]
  const col = await certificationAttempts()
  const held = new Set<string>()
  for (let i = 0; i < userIds.length; i += 500) {
    const chunk = userIds.slice(i, i + 500)
    const rows = await col
      .find(
        {
          user_id: { $in: chunk },
          $or: [
            { issue_key: { $in: chunk.map((u) => examCertificateIssueKey(examId, u)) } },
            { certification_id: examId, passed: true },
          ],
        } as Record<string, unknown>,
        { projection: { user_id: 1 } },
      )
      .toArray()
    for (const r of rows) held.add(String(r.user_id))
  }

  const done = new Set<string>()
  for (const sub of passing) {
    const uid = String(sub.user_id)
    if (done.has(uid)) continue
    counts.checked++
    if (held.has(uid)) {
      counts.existing++
      done.add(uid)
      continue
    }
    try {
      const cert = await issueExamCertificate(db, exam, sub, cutoff)
      if (!cert) continue // this row didn't qualify; another row of the same user may
      done.add(uid)
      if (cert.created) {
        counts.issued++
        await deliverExamCertificate(exam, uid, cert)
      } else counts.existing++
    } catch (e) {
      counts.failed++
      console.error('[certifications] backfill issue failed:', examId, uid, e)
    }
  }
  return counts
}

// ─── Revocation ──────────────────────────────────────────────────────────────

/**
 * Certificates issued for one exam: `certification_id` = exam id, or linked
 * to one of its submissions via `exam_submission_id`.
 */
export function examCertificatesFilter(examId: string, submissionIds: string[] = []): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ certification_id: examId }]
  const subs = submissionIds.filter(Boolean)
  if (subs.length) or.push({ exam_submission_id: { $in: subs } })
  return { $or: or }
}

/**
 * Revoke every live certificate of an exam (used when the exam is deleted, so
 * its certificates stop verifying as valid). Already revoked ones keep their
 * original revocation. Returns how many were revoked now.
 */
export async function revokeExamCertificates(
  examId: string,
  submissionIds: string[],
  revokedBy: string,
  reason: string,
): Promise<number> {
  const col = await certificationAttempts()
  const res = await col.updateMany(
    { ...examCertificatesFilter(examId, submissionIds), passed: true, revoked_at: null } as Record<string, unknown>,
    { $set: { revoked_at: nowIso(), revoked_by: revokedBy, revoke_reason: reason } },
  )
  return res.modifiedCount
}

/** Certificate status per holder (user id) for one exam's results page. */
export async function examCertificatesByUser(
  examId: string,
  submissionIds: string[],
): Promise<Map<string, { id: string; revokedAt: string | null; verifyToken: string | null }>> {
  const col = await certificationAttempts()
  const rows = await col
    .find(
      { ...examCertificatesFilter(examId, submissionIds), passed: true } as Record<string, unknown>,
      { projection: { _id: 1, id: 1, user_id: 1, revoked_at: 1, verify_token: 1, submitted_at: 1 } },
    )
    .sort({ submitted_at: -1 })
    .limit(5000)
    .toArray()
  const out = new Map<string, { id: string; revokedAt: string | null; verifyToken: string | null }>()
  for (const r of rows) {
    const uid = String(r.user_id || '')
    if (!uid || out.has(uid)) continue
    out.set(uid, {
      id: r.id || String((r as { _id?: unknown })._id),
      revokedAt: r.revoked_at || null,
      verifyToken: r.verify_token || null,
    })
  }
  return out
}

// ─── Codeathon certificates ──────────────────────────────────────────────────

/** Stable key: one certificate per participant per codeathon (re-releases never add a second). */
export const codeathonCertificateIssueKey = (codeathonId: string, userId: string): string =>
  `codeathon:${codeathonId}:${userId}`

export interface CodeathonCertificateInput {
  codeathonId: string
  codeathonTitle: string
  userId: string
  /** Public name on the certificate — never an email address. */
  holderName: string
  kind: 'rank' | 'participation'
  /** e.g. "1st place" / "Participant". */
  level: string
  /** e.g. "Ranked #1 of 40" / "Certificate of participation" (no "%", so no score band). */
  scoreLabel: string
  rank: number | null
  template?: string
  /** Line under the title (default "CodeSpectra codeathon"; hosted contests pass their format). */
  source?: string
}

/**
 * Issue (or find) the codeathon certificate for one participant. Idempotent
 * through `issue_key`: repeat releases and concurrent calls return the
 * existing row, and `created` is true only for the call that wrote it.
 */
export async function issueCodeathonCertificate(
  input: CodeathonCertificateInput,
): Promise<{ token: string; created: boolean } | null> {
  if (!input.codeathonId || !input.userId) return null
  const col = await certificationAttempts()
  const issueKey = codeathonCertificateIssueKey(input.codeathonId, input.userId)
  const now = nowIso()
  const template = input.template && CERT_TEMPLATE_KEYS.has(input.template) ? input.template : undefined
  const name = input.holderName && !looksLikeEmail(input.holderName) ? input.holderName.slice(0, 120) : 'Participant'
  const doc: CertificationAttemptDoc & { codeathon_id: string; certificate_kind: string; rank: number | null } = {
    id: newId(),
    user_id: input.userId,
    certification_id: `codeathon:${input.codeathonId}`,
    issue_key: issueKey,
    verify_token: newToken(),
    started_at: now,
    submitted_at: now,
    score: 0,
    passed: true,
    score_label: input.scoreLabel,
    snapshot: { name },
    cert_snapshot: {
      title: String(input.codeathonTitle || 'Codeathon').slice(0, 200),
      level: input.level,
      source: input.source ? String(input.source).slice(0, 80) : 'CodeSpectra codeathon',
    },
    event_title: input.codeathonTitle || null,
    codeathon_id: input.codeathonId,
    certificate_kind: input.kind,
    rank: input.rank,
    ...(template ? { template } : {}),
  }

  await ensureIssuedCertificateIndex()
  let created = false
  try {
    const res = await col.updateOne({ issue_key: issueKey }, { $setOnInsert: doc }, { upsert: true })
    created = res.upsertedCount > 0
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  if (created) return { token: doc.verify_token, created: true }
  const saved = await col.findOne({ issue_key: issueKey }, { projection: { verify_token: 1 } })
  return saved?.verify_token ? { token: saved.verify_token, created: false } : null
}

/** Verify token of a participant's live (not revoked) codeathon certificate, if any. */
export async function codeathonCertificateToken(codeathonId: string, userId: string): Promise<string | null> {
  if (!codeathonId || !userId) return null
  const row = await (await certificationAttempts()).findOne(
    { issue_key: codeathonCertificateIssueKey(codeathonId, userId), revoked_at: null } as Record<string, unknown>,
    { projection: { verify_token: 1 } },
  )
  return typeof row?.verify_token === 'string' ? row.verify_token : null
}
