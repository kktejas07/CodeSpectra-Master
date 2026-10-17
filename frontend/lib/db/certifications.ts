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
import type { Collection } from 'mongodb'
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
  }
  return out
}
