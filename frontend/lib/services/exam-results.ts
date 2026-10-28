/**
 * Per-test results for staff (candidates, scores, flags, release state,
 * certificates, outcomes). Extracted from GET /api/admin/exams/[id]/results —
 * the results page and the admin agent read the same rows.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { requireTenantEntity, type APIUser } from '@/lib/route-auth'
import { attemptSummary, submissionSectionScores, PROCTOR_INFO_EVENT_TYPES } from '@/lib/exam-access'
import { resolveSections, type SectionScore } from '@/lib/exam-sections'
import { outcomesByUser } from '@/lib/hiring-outcomes'
import { examCertificatesByUser } from '@/lib/db/certifications'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

export interface CandidateResultRow {
  id: string
  userId: string
  name: string
  email: string
  status: string
  score: number | null
  maxScore: number | null
  submittedAt: string | null
  inviteToken?: string | null
  invitedAt: string | null
  /** Automatic reminders sent for this invite (24 h cron + W15 invite ladder). */
  reminderCount?: number
  proctoringFlags: number
  released: boolean
  deliveryStatus: string | null
  graded: boolean
  /** AI graded but a question is flagged for human review (pending_review). */
  needsReview: boolean
  source?: string
  /** Attempt number of the latest attempt, attempts allowed, and best score (percent). */
  attemptNo?: number
  maxAttempts?: number
  bestScore?: number | null
  bestAttemptNo?: number | null
  kind?: string
  /** Took the test without a camera (uploaded ID): identity must be checked by hand. */
  identityReview?: boolean
  /** Advisory face match of ID photo vs selfie (0–1), when computed. */
  faceMatch?: number | null
  /** This candidate's certificate for the exam, if one was issued. */
  certificate?: { id: string; revokedAt: string | null; verifyToken: string | null } | null
  /** Per-section scores (sectioned tests only). */
  sectionScores?: SectionScore[]
  /** Recorded hiring outcome for this test, if any. */
  outcome?: string | null
  totalTimeMs?: number | null
}

export interface ExamResultsPayload {
  exam: Record<string, unknown>
  results: CandidateResultRow[]
  plagiarism: null
  leakDetection: null
  debug: { inviteCount: number; submissionCount: number }
}

export async function getExamResults(user: ServiceUser, id: string): Promise<ServiceResult<ExamResultsPayload>> {
  const db = await getMongoDb()

  const owned = await requireTenantEntity(db, 'exams', id, user as APIUser)
  if ('error' in owned) return fail(owned.status ?? 403, String(owned.error))
  const exam = owned.doc

  // Indexed lookups (A-012): invites carry exam_id / exam_ids (legacy rows are
  // backfilled by lib/db-indexes.ts on boot); the regex fallback only touches
  // rows that still have no exam_id.
  const legacyRe = { $regex: id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') }
  const invites = await db.collection('candidate_invites').find({
    $or: [
      { exam_id: id },
      { exam_ids: id },
      // Not yet backfilled (exam_id null/missing uses the exam_id index).
      { exam_id: null, $or: [{ target_url: legacyRe }, { 'assigned_assessments.target_url': legacyRe }] },
    ],
  }).toArray()

  // Identity photos are never loaded for the list (A-011) — reviewers open
  // them one candidate at a time through short-lived signed URLs.
  const submissions = await db.collection('exam_submissions').find({
    exam_id: id,
  }, { projection: { id_photo: 0, face_photo: 0 } }).toArray()

  // Latest attempt per user (legacy rows may hold several per user).
  const submissionsByUser: Record<string, typeof submissions[0]> = {}
  for (const sub of submissions) {
    const prev = submissionsByUser[sub.user_id]
    if (!prev || String(sub.created_at || '') > String(prev.created_at || '')) submissionsByUser[sub.user_id] = sub
  }

  // Email fallback map — invited-link invites are created with an empty
  // user_id, so join by email when the user_id lookup misses.
  const submissionsByEmail: Record<string, typeof submissions[0]> = {}
  for (const sub of submissions) {
    const key = String(sub.email || '').toLowerCase()
    if (!key) continue
    const existing = submissionsByEmail[key]
    if (!existing || String(sub.created_at || '') > String(existing.created_at || '')) {
      submissionsByEmail[key] = sub
    }
  }

  const userMap: Record<string, { name?: string; email?: string }> = {}
  const fetchedIds = new Set<string>()
  const fetchUser = async (uid: string) => {
    if (!uid || fetchedIds.has(uid)) return
    fetchedIds.add(uid)
    const u = await db.collection('user').findOne(
      { $or: [{ _id: uid as any }, { id: uid }] },
      { projection: { name: 1, fullName: 1, email: 1 } },
    )
    if (u) {
      userMap[uid] = { name: u.fullName || u.name || '', email: u.email || '' }
    }
  }

  // Also fetch users for submissions that don't have invites (public/share-link candidates).
  // ponytail: single parallel batch — the old sequential await-per-user loop
  // turned 65 candidates into 65+ serial Mongo roundtrips on every page load.
  const submissionUserIds = new Set<string>()
  for (const sub of submissions) {
    if (sub.user_id && !sub.user_id.startsWith('candidate_')) {
      submissionUserIds.add(sub.user_id)
    }
  }
  for (const inv of invites) {
    if (inv.user_id) submissionUserIds.add(inv.user_id)
  }
  await Promise.all([...submissionUserIds].map((uid) => fetchUser(uid)))

  const outcomes = await outcomesByUser(db, id)
  // Certificates for this exam, by holder (for revoke on the results page).
  const certByUser = await examCertificatesByUser(id, submissions.map((s) => String(s.id)))
  const attemptFields = (sub: Record<string, unknown> | undefined) => {
    if (!sub) return {}
    const a = attemptSummary(sub, exam as Record<string, unknown>)
    return {
      attemptNo: a.attempt_no,
      maxAttempts: a.max_attempts,
      bestScore: a.best ? toPercent(a.best.score, a.best.max_score) : null,
      bestAttemptNo: a.best?.attempt_no ?? null,
      ...(sub.kind ? { kind: String(sub.kind) } : {}),
      ...identityFields(sub),
      certificate: certByUser.get(String(sub.user_id || '')) ?? null,
      sectionScores: submissionSectionScores(exam as Record<string, unknown>, sub),
      outcome: (outcomes.get(String(sub.user_id || ''))?.status as string | undefined) ?? null,
      totalTimeMs: typeof sub.total_time_ms === 'number' ? sub.total_time_ms : null,
    }
  }
  const identityFields = (sub: Record<string, unknown>) => {
    const ic = sub.identity_check as { needs_manual_review?: boolean; face_match?: { status?: string; similarity?: number } | null } | null | undefined
    return {
      identityReview: ic?.needs_manual_review === true,
      faceMatch: ic?.face_match?.status === 'compared' && typeof ic.face_match.similarity === 'number' ? ic.face_match.similarity : null,
    }
  }

  // Score is stored as raw points (e.g. 121/166). The admin UI displays it
  // as a percentage, so normalize to 0-100 here — this is what prevents
  // "scores over 100%" when an exam's max points != 100.
  const toPercent = (score: number | undefined, max: number | undefined) => {
    if (score == null || !max) return null
    return Math.min(100, Math.round((score / max) * 100))
  }

  // Fetch proctor event counts for all users
  const proctorCounts = await db.collection('proctor_events').aggregate([
    // Integrity flags = risk events only (see PROCTOR_INFO_EVENT_TYPES).
    { $match: { session_kind: 'exam', session_id: id, event_type: { $nin: [...PROCTOR_INFO_EVENT_TYPES] } } },
    { $group: { _id: '$user_id', count: { $sum: 1 } } },
  ]).toArray()
  const proctorMap = new Map(proctorCounts.map((p: any) => [p._id, p.count]))

  // Deduplicate invites by email — keep the most recent one
  const latestInviteByEmail = new Map<string, typeof invites[0]>()
  for (const inv of invites) {
    const key = (inv.email || '').toLowerCase()
    const existing = latestInviteByEmail.get(key)
    if (!existing || new Date(inv.created_at) > new Date(existing.created_at)) {
      latestInviteByEmail.set(key, inv)
    }
  }

  const results: CandidateResultRow[] = []
  const seenEmails = new Set<string>()
  const matchedSubmissionIds = new Set<string>()

  for (const [, inv] of latestInviteByEmail) {
    const invEmail = String(inv.email || '').toLowerCase()
    const sub = submissionsByUser[inv.user_id]
      || (invEmail ? submissionsByEmail[invEmail] : undefined)
    if (sub) matchedSubmissionIds.add(String(sub.id))
    const user = userMap[inv.user_id] || {}

    // Only mark as completed if there's an actual submission record
    const hasSubmission = !!sub
    let status = hasSubmission ? 'completed' : (inv.status === 'used' ? 'in_progress' : inv.status || 'pending')

    const email = inv.email || user.email || ''
    seenEmails.add(email.toLowerCase())

    results.push({
      id: inv.id,
      userId: inv.user_id || '',
      name: inv.full_name || user.name || email.split('@')[0] || 'Candidate',
      email,
      status,
      score: sub ? toPercent(sub.score, sub.max_score) : null,
      maxScore: sub ? sub.max_score : null,
      submittedAt: sub?.submitted_at || sub?.created_at || null,
      invitedAt: inv.created_at || null,
      // Admin-only, tenant-checked route: the token lets the recruiter copy
      // the candidate's real /assessment/invite/[token] link.
      inviteToken: inv.token || null,
      reminderCount: Math.max(0, Number(inv.reminder_count) || (inv.reminded_at ? 1 : 0)),
      proctoringFlags: proctorMap.get(inv.user_id) || (sub ? proctorMap.get(sub.user_id) || 0 : 0),
      released: sub?.released_at ? true : false,
      deliveryStatus: sub && inv.delivery_status === 'sending' ? 'delivered' : (inv.delivery_status || null),
      graded: sub ? (sub.has_pending_review === false) : false,
      needsReview: sub ? (sub.has_pending_review === true) : false,
      ...attemptFields(sub as Record<string, unknown> | undefined),
    })
  }

  for (const sub of submissions) {
    // Skip submissions already shown on an invite row above (matched by
    // user_id or by email fallback).
    if (matchedSubmissionIds.has(String(sub.id))) continue
    if (invites.some(inv => inv.user_id && inv.user_id === sub.user_id)) continue

    const email = sub.email || userMap[sub.user_id]?.email || ''
    if (!email || seenEmails.has(email.toLowerCase())) continue

    const fetched = userMap[sub.user_id] || {}

    results.push({
      id: sub.id,
      userId: sub.user_id || '',
      name: fetched.name || sub.email?.split('@')[0] || 'Candidate',
      email: email,
      status: 'completed',
      score: toPercent(sub.score, sub.max_score),
      maxScore: sub.max_score || null,
      submittedAt: sub.submitted_at || sub.created_at || null,
      invitedAt: sub.submitted_at || sub.created_at || null,
      proctoringFlags: proctorMap.get(sub.user_id) || 0,
      released: sub.released_at ? true : false,
      deliveryStatus: 'delivered',
      graded: sub.has_pending_review === false,
      needsReview: sub.has_pending_review === true,
      source: sub.source || 'public_link',
      ...attemptFields(sub as Record<string, unknown>),
    })
    seenEmails.add(email.toLowerCase())
  }

  // Plagiarism / leak detection intentionally NOT run here: it costs two
  // sequential LLM calls (up to ~30s of timeouts with degraded providers)
  // on every page load, and no UI consumes the result (verified: zero
  // readers of these response fields). If detection UI is ever added, call
  // the detectors from a dedicated lazy endpoint, never the list path.
  const plagiarism = null
  const leakDetection = null

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      level: exam.level || '',
      duration: exam.duration || 0,
      publicLinkViews: exam.public_link_views || 0,
      plagiarismReport: exam.plagiarism_report || null,
      passing_score: Number.isFinite(Number(exam.passing_score)) && exam.passing_score !== null ? Number(exam.passing_score) : null,
      issue_certificates: exam.issue_certificates !== false,
      sections: resolveSections(exam as Record<string, unknown>).map((s) => ({ id: s.id, title: s.title })),
    },
    results,
    plagiarism,
    leakDetection,
    debug: { inviteCount: invites.length, submissionCount: submissions.length },
  })
}
