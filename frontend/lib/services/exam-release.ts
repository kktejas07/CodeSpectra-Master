/**
 * Bulk score release for one test. Extracted from
 * POST /api/admin/exams/[id]/release-scores — the route and the admin agent
 * both call releaseExamScores, so pass marks, certificates and candidate
 * notifications are identical.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { notifyResultsReleased } from '@/lib/exam-release-notify'
import { deliverExamCertificate, issueExamCertificate } from '@/lib/db/certifications'
import { examPassPercent, isExamStaff } from '@/lib/exam-access'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

export const clampCutoff = (v: unknown, fallback: number): number => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export const pctOf = (sub: Record<string, any>): number | null => {
  const s = Number(sub.score)
  const m = Number(sub.max_score)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null
  return Math.max(0, Math.min(100, Math.round((s / m) * 100)))
}

async function loadStaffExam(user: ServiceUser, examId: string): Promise<ServiceResult<Record<string, any>>> {
  if (!examId) return fail(400, 'id required')
  const db = await getMongoDb()
  const exam = await db.collection('exams').findOne({ id: examId })
  if (!exam) return fail(404, 'Not found')
  if (!isExamStaff(user, exam)) return fail(403, 'Forbidden - resource belongs to another tenant')
  return ok(exam as Record<string, any>)
}

export interface ReleasePreview {
  cutoff: number
  unreleased: number
  releasable: number
  pass: number
  fail: number
  skipped_pending: number
  /** Upper bound: passing releasable attempts (one certificate per candidate, never duplicated). */
  certificates_estimate: number
  issue_certificates: boolean
}

/** What a release would do right now — reads only. */
export async function previewExamRelease(user: ServiceUser, examId: string, cutoffIn?: unknown): Promise<ServiceResult<ReleasePreview>> {
  const owned = await loadStaffExam(user, examId)
  if (!owned.ok) return owned
  const exam = owned.data
  const cutoff = clampCutoff(cutoffIn, examPassPercent(exam))
  const db = await getMongoDb()
  const submissions = await db.collection('exam_submissions')
    .find({ exam_id: examId, score_released: { $ne: true } }, { projection: { _id: 0, user_id: 1, score: 1, max_score: 1, has_pending_review: 1 } })
    .toArray()
  const releasable = submissions.filter((s) => s.has_pending_review !== true)
  let pass = 0
  const passingUsers = new Set<string>()
  for (const s of releasable) {
    const pct = pctOf(s)
    if (pct !== null && pct >= cutoff) { pass++; passingUsers.add(String(s.user_id)) }
  }
  const issue = exam.issue_certificates !== false
  return ok({
    cutoff,
    unreleased: submissions.length,
    releasable: releasable.length,
    pass,
    fail: releasable.length - pass,
    skipped_pending: submissions.length - releasable.length,
    certificates_estimate: issue ? passingUsers.size : 0,
    issue_certificates: issue,
  })
}

export interface ReleaseResult {
  released: number
  passed: number
  failed: number
  skipped_pending: number
  cutoff: number
  certificates_issued?: number
}

export async function releaseExamScores(user: ServiceUser, examId: string, cutoffIn?: unknown): Promise<ServiceResult<ReleaseResult>> {
  const owned = await loadStaffExam(user, examId)
  if (!owned.ok) return owned
  const exam = owned.data
  const db = await getMongoDb()

  // Cutoff remembers per exam: explicit body > stored passing_score > 40% (examPassPercent).
  const cutoff = clampCutoff(cutoffIn, examPassPercent(exam))
  if (exam.passing_score !== cutoff) {
    await db.collection('exams').updateOne({ id: examId }, { $set: { passing_score: cutoff } })
  }

  const submissions = await db.collection('exam_submissions')
    .find({ exam_id: examId, score_released: { $ne: true } })
    .toArray()

  if (submissions.length === 0) {
    return ok({ released: 0, passed: 0, failed: 0, skipped_pending: 0, cutoff })
  }

  // Only graded work releases — pending_review stays locked (same as before).
  const releasable = submissions.filter((s) => s.has_pending_review !== true)
  const skippedPending = submissions.length - releasable.length

  const now = nowIso()
  let passed = 0
  let failed = 0
  for (const sub of releasable) {
    const pct = pctOf(sub)
    const isPass = pct !== null && pct >= cutoff
    if (isPass) passed++
    else failed++
    await db.collection('exam_submissions').updateOne(
      { _id: sub._id },
      { $set: { score_released: true, released_at: now, passed: isPass, cutoff } }
    )
  }

  // Verifiable certificates for every released attempt at or above the pass mark
  // (one per candidate per exam; re-releases and retakes never duplicate).
  let certificatesIssued = 0
  if (exam.issue_certificates !== false) {
    for (const sub of releasable) {
      const fresh = { ...sub, score_released: true, released_at: now }
      try {
        const cert = await issueExamCertificate(db, exam, fresh, cutoff)
        if (!cert?.created) continue
        certificatesIssued++
        // In-app for account holders; email with the verify link for invite-only candidates.
        await deliverExamCertificate(exam, String(sub.user_id), cert)
      } catch (e) {
        // Never fail the release over one certificate; it can be re-issued by releasing again.
        console.error('[release-scores] certificate issue failed:', sub.user_id, e)
      }
    }
  }

  // Same channels as the single release (in-app + WhatsApp + email).
  for (const sub of releasable) {
    await notifyResultsReleased(db, exam as Record<string, unknown>, sub as Record<string, unknown>)
  }

  return ok({ released: releasable.length, passed, failed, skipped_pending: skippedPending, cutoff, certificates_issued: certificatesIssued })
}
