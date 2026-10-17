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
}

/**
 * Issue the assessment certificate for one candidate after their score is
 * released. Picks the best RELEASED attempt that meets `cutoff` — the current
 * submission (when released) or the archived `previous_best_released` — and
 * writes one certificate per (exam, user) keyed by `issue_key`. Idempotent:
 * repeat releases, retakes and concurrent calls return the existing row.
 *
 * Returns null when certificates are off for the exam, the candidate has no
 * platform account (`candidate_*` placeholder ids) or no released attempt passes.
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
  if (!examId || !userId || userId.startsWith('candidate_')) return null

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

  const userDoc = await db.collection('user').findOne(
    { $or: [{ id: userId }, { _id: userId }] } as Record<string, unknown>,
    { projection: { name: 1, fullName: 1, email: 1 } },
  )
  const name = String(userDoc?.fullName || userDoc?.name || (typeof sub.email === 'string' ? sub.email.split('@')[0] : '') || 'Candidate')
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
    snapshot: { name },
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
  if (created) return { token: doc.verify_token, created: true }
  const saved = await col.findOne({ issue_key: issueKey }, { projection: { verify_token: 1 } })
  return saved?.verify_token ? { token: saved.verify_token, created: false } : null
}
