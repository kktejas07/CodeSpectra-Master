/**
 * Server-side exam access + projection helpers shared by
 * GET /api/exams/[id], POST /api/exams/[id]/submit and the exam update routes.
 *
 * The candidate page (`app/assessment/[id]/page.tsx`) shows the same gates for
 * UX, but these are the ones that actually hold.
 */
import type { Db, ObjectId } from 'mongodb'
import type { APIUser } from '@/lib/route-auth'
import {
  advanceSections, editableQuestionIds, enterSection, initSectionsState, mergeSectionAnswers, normalizeSections,
  parseSectionsState, resolveSections, sectionScores, type ExamSection, type SectionScore, type SectionsState,
} from '@/lib/exam-sections'
import { isScoredType } from '@/lib/question-types'

type Doc = Record<string, unknown>

/** Superadmin, or a tenant_admin of the entity's own tenant (a missing tenantId never matches). */
export function isTenantStaff(user: Pick<APIUser, 'role' | 'tenantId'> | null | undefined, entity: Doc): boolean {
  if (!user) return false
  if (user.role === 'superadmin') return true
  return user.role === 'tenant_admin' && !!user.tenantId && entity.tenant_id === user.tenantId
}
export const isExamStaff = isTenantStaff

// ─── Candidate projection ────────────────────────────────────────────────────

/** Fields a candidate needs to render and answer a question. Everything else
 *  (answer, correct_answer, correctAnswer, explanation, rubric, hidden tests,
 *  grader config, …) is dropped. */
const CANDIDATE_QUESTION_FIELDS = [
  'id', 'type', 'title', 'prompt', 'question', 'text', 'options', 'score', 'points',
  'starter_code', 'starterCode', 'language', 'languages', 'matrix', 'table', 'scale',
  'image_url', 'imageUrl', 'regions', 'time_limit_seconds', 'multi',
] as const

function candidateQuestion(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object') return {}
  const q = raw as Doc
  const out: Doc = {}
  for (const k of CANDIDATE_QUESTION_FIELDS) if (q[k] !== undefined) out[k] = q[k]

  // `pairs` IS the answer key (left → right). Keep the lefts in order and hand
  // out the rights sorted, so the UI still gets every option but row i no
  // longer carries its correct match.
  if (Array.isArray(q.pairs)) {
    const pairs = q.pairs as Array<{ left?: unknown; right?: unknown }>
    const rights = pairs.map((p) => String(p?.right ?? '')).sort((a, b) => a.localeCompare(b))
    out.pairs = pairs.map((p, i) => ({ left: String(p?.left ?? ''), right: rights[i] }))
  }

  // Only sample test cases, and only the visible fields.
  const cases = (q.test_cases ?? q.testCases) as unknown
  if (Array.isArray(cases)) {
    out.test_cases = cases
      .filter((tc) => tc && typeof tc === 'object'
        && (tc as Doc).isSample !== false && (tc as Doc).hidden !== true && (tc as Doc).is_hidden !== true)
      .map((tc) => {
        const t = tc as Doc
        return {
          input: String(t.input ?? t.stdin ?? ''),
          output: String(t.output ?? t.expected ?? t.expected_output ?? t.expected_stdout ?? ''),
          ...(t.explanation ? { explanation: String(t.explanation) } : {}),
        }
      })
  }
  return out
}

/** Exam-level fields that only graders should see. */
const STAFF_ONLY_EXAM_FIELDS = ['rubric', 'rubrics', 'grading', 'grader', 'answer_key', 'hidden_tests', 'ai_grading_prompt']

/** Exam doc as a candidate may see it: no answer keys, no hidden tests. */
export function candidateExamView(doc: Doc): Doc {
  const out: Doc = { ...doc }
  delete out._id
  for (const k of STAFF_ONLY_EXAM_FIELDS) delete out[k]
  if (Array.isArray(doc.questionList)) out.questionList = doc.questionList.map(candidateQuestion)
  if (Array.isArray(doc.questions)) out.questions = doc.questions.map(candidateQuestion)
  // Sections: resolved + whitelisted fields only (titles, instructions, timing, question ids).
  const sections = resolveSections(doc)
  if (sections.length) out.sections = sections
  else delete out.sections
  return out
}

/** Objective answer key for one question (used only once scores are released). */
export function questionAnswerKey(q: Doc): string | undefined {
  const a = q.answer ?? q.correct_answer
  return a === undefined || a === null || a === '' ? undefined : String(a)
}

// ─── Entry checks (submit) ───────────────────────────────────────────────────

// ponytail: invites that expire mid-attempt still allow the submit for this long.
const INVITE_SUBMIT_GRACE_MS = 6 * 3600 * 1000

/** True when the invite names this exam (exam_id, its target_url or an assigned step). */
export function inviteIsForExam(invite: Doc, examId: string): boolean {
  return inviteCoversExam(invite, examId)
}

function inviteCoversExam(invite: Doc, examId: string): boolean {
  if (invite.exam_id) return invite.exam_id === examId
  const target = String(invite.target_url || '')
  const assigned = assignedExamIds(invite.assigned_assessments) ?? []
  const targetId = examIdFromTargetUrl(target)
  if (!targetId && assigned.length === 0) return false // names no exam: never a key to one
  return targetId === examId || assigned.includes(examId)
}

export type ExamAccessResult =
  | {
      ok: true
      invite: Doc | null
      source: 'invite' | 'link' | 'open'
      /** The candidate's current (latest) submission, if any — a retake replaces it. */
      current: Doc | null
      /** 1-based number of the attempt this submit would create. */
      attemptNo: number
      maxAttempts: number
    }
  | { ok: false; error: string; status: number }

// ─── Attempts / retakes ──────────────────────────────────────────────────────

export const MAX_ATTEMPTS_CAP = 20

/** Message shown to candidates who reach an invite-only exam without a valid invite or link. */
export const INVITE_ONLY_MESSAGE = 'This test is invite-only. Use the link from your invite email.'

/**
 * Retake policy for an exam. `max_attempts` defaults to 1. Exams saved before
 * `max_attempts` existed with `allow_retake: true` (which used to mean "no
 * limit") get one retake (2 attempts) instead of silently losing it.
 */
export function examAttemptPolicy(exam: Doc): { allowRetake: boolean; maxAttempts: number } {
  const allowRetake = exam.allow_retake === true
  if (!allowRetake) return { allowRetake: false, maxAttempts: 1 }
  const raw = Number(exam.max_attempts)
  const max = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2
  return { allowRetake: true, maxAttempts: Math.min(MAX_ATTEMPTS_CAP, max) }
}

/** Coerce retake settings from an editor body (call after pickFields). */
export function normalizeRetakeFields(data: Doc): void {
  if ('allow_retake' in data) data.allow_retake = data.allow_retake === true
  if ('max_attempts' in data) {
    const n = Math.floor(Number(data.max_attempts))
    data.max_attempts = Number.isFinite(n) ? Math.min(MAX_ATTEMPTS_CAP, Math.max(1, n)) : 1
  }
}

export interface AttemptScore {
  score: number
  max_score: number
  attempt_no: number
  released: boolean
}

function isReleased(sub: Doc): boolean {
  return sub.score_released === true || !!sub.released_at
}

function pct(s: AttemptScore | null | undefined): number {
  return s && s.max_score > 0 ? s.score / s.max_score : -1
}

function better(a: AttemptScore | null | undefined, b: AttemptScore | null | undefined): AttemptScore | null {
  if (!a) return b ?? null
  if (!b) return a
  return pct(b) > pct(a) ? b : a
}

function asAttemptScore(raw: unknown): AttemptScore | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Doc
  return {
    score: Number(r.score) || 0,
    max_score: Number(r.max_score) || 0,
    attempt_no: Number(r.attempt_no) || 1,
    released: r.released === true,
  }
}

/** Score of a submission doc as an attempt record. */
export function attemptScoreOf(sub: Doc): AttemptScore {
  return {
    score: Number(sub.score) || 0,
    max_score: Number(sub.max_score) || 0,
    attempt_no: Number(sub.attempt_no) || 1,
    released: isReleased(sub),
  }
}

/**
 * Latest + best for one candidate. `sub` is the current (latest) submission;
 * earlier attempts are summarised on it as `previous_best` (any attempt) and
 * `previous_best_released` (released attempts only). Pass `releasedOnly` for
 * candidate-facing views so unreleased scores never leak.
 */
export function attemptSummary(sub: Doc, exam: Doc, releasedOnly = false): {
  attempt_no: number
  max_attempts: number
  latest: AttemptScore
  best: AttemptScore | null
} {
  const latest = attemptScoreOf(sub)
  const prev = asAttemptScore(releasedOnly ? sub.previous_best_released : sub.previous_best)
  const best = releasedOnly ? better(prev, latest.released ? latest : null) : better(prev, latest)
  return { attempt_no: latest.attempt_no, max_attempts: examAttemptPolicy(exam).maxAttempts, latest, best }
}

let examIndexesReady: Promise<void> | null = null

/**
 * Idempotent index setup for attempts. The unique key is partial (only docs
 * that carry `attempt_no`), so legacy duplicate submissions from before
 * attempts were tracked don't block the index build.
 */
export function ensureExamIndexes(db: Db): Promise<void> {
  if (!examIndexesReady) {
    examIndexesReady = (async () => {
      try {
        await db.collection('exam_submissions').createIndex(
          { exam_id: 1, user_id: 1 },
          { unique: true, name: 'exam_submissions_one_current_attempt', partialFilterExpression: { attempt_no: { $exists: true } } },
        )
        await db.collection('exam_submission_attempts').createIndex({ id: 1 }, { unique: true, name: 'exam_submission_attempts_id' })
        await db.collection('exam_submission_attempts').createIndex({ exam_id: 1, user_id: 1 }, { name: 'exam_submission_attempts_exam_user' })
        await db.collection('exam_submission_files').createIndex({ id: 1 }, { unique: true, name: 'exam_submission_files_id' })
        await db.collection('exam_submission_files').createIndex({ exam_id: 1, user_id: 1, status: 1 }, { name: 'exam_submission_files_exam_user' })
        await db.collection('exam_identity_checks').createIndex({ exam_id: 1, user_id: 1, attempt_no: 1 }, { unique: true, name: 'exam_identity_checks_attempt' })
      } catch (e) {
        // Most likely an index that already exists with other options; never block a submit on it.
        console.error('[CodeSpectra] ensureExamIndexes:', e)
      }
    })()
  }
  return examIndexesReady
}

function isDuplicateKey(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: number }).code === 11000
}

/**
 * Store a new attempt atomically. First attempt: insert (the partial unique
 * key on exam_id+user_id rejects a concurrent double submit). Retake: the
 * previous attempt is archived to `exam_submission_attempts`, then the current
 * doc is replaced only if it is still the attempt we read — so two
 * simultaneous retakes can't both land. Exactly one current doc per candidate
 * keeps every existing grading/release route working unchanged.
 */
export async function recordExamAttempt(
  db: Db,
  current: Doc | null,
  doc: Doc,
  attemptNo: number,
): Promise<{ ok: true } | { ok: false; conflict: true }> {
  await ensureExamIndexes(db)
  const col = db.collection('exam_submissions')
  if (!current) {
    try {
      await col.insertOne({ ...doc, attempt_no: attemptNo })
      return { ok: true }
    } catch (e) {
      if (isDuplicateKey(e)) return { ok: false, conflict: true }
      throw e
    }
  }

  const { _id, ...snapshot } = current
  await db.collection('exam_submission_attempts').updateOne(
    { id: String(current.id) },
    { $setOnInsert: { ...snapshot, attempt_no: Number(current.attempt_no) || 1, archived_at: new Date().toISOString() } },
    { upsert: true },
  )
  const prevScore = attemptScoreOf(current)
  const previousBest = better(asAttemptScore(current.previous_best), prevScore)
  const previousBestReleased = better(asAttemptScore(current.previous_best_released), prevScore.released ? prevScore : null)
  const res = await col.replaceOne(
    { _id: _id as ObjectId, ...(current.attempt_no !== undefined ? { attempt_no: current.attempt_no } : { attempt_no: { $exists: false } }) },
    { ...doc, attempt_no: attemptNo, previous_best: previousBest, previous_best_released: previousBestReleased },
  )
  return res.matchedCount === 1 ? { ok: true } : { ok: false, conflict: true }
}

/**
 * Enforces, on the server: published, availability window, invite-only access
 * (valid invite for this exam and account, or a valid ?link= token), and the
 * attempt limit (`allow_retake` + `max_attempts`, see examAttemptPolicy).
 */
export interface ExamEntryOptions {
  /**
   * Skip the `ends_at` check. Submit and save-draft use this: their limit is
   * the attempt deadline (already capped at `ends_at`), so an attempt started
   * before the window closed can still be finalised.
   */
  ignoreWindowClose?: boolean
  /** Count this candidate against the link's `max_uses` (once per account). Used by the start route. */
  claimLinkUse?: boolean
}

export async function checkExamEntry(
  db: Db,
  exam: Doc,
  user: Pick<APIUser, 'id' | 'email'>,
  tokens: { inviteToken?: string | null; linkToken?: string | null },
  opts: ExamEntryOptions = {},
): Promise<ExamAccessResult> {
  const examId = String(exam.id)
  const now = Date.now()

  if (!exam.published) return { ok: false, error: 'This assessment is not available.', status: 403 }
  const startsAt = exam.starts_at ? new Date(String(exam.starts_at)).getTime() : NaN
  if (!Number.isNaN(startsAt) && now < startsAt) {
    return { ok: false, error: 'This assessment has not opened yet.', status: 403 }
  }
  const endsAt = exam.ends_at ? new Date(String(exam.ends_at)).getTime() : NaN
  if (!opts.ignoreWindowClose && !Number.isNaN(endsAt) && now > endsAt) {
    return { ok: false, error: 'Assessment window has closed', status: 403 }
  }

  const email = (user.email || '').toLowerCase()
  const mine = { exam_id: examId, $or: [{ user_id: user.id }, ...(email ? [{ email: user.email }] : [])] }
  const current = (await db.collection('exam_submissions').findOne(mine, { sort: { created_at: -1 } })) as Doc | null
  // Legacy rows (before attempt_no) are counted one per doc.
  const used = current
    ? Math.max(Number(current.attempt_no) || 0, await db.collection('exam_submissions').countDocuments(mine))
    : 0
  const { maxAttempts } = examAttemptPolicy(exam)
  if (used >= maxAttempts) {
    return {
      ok: false,
      error: maxAttempts === 1
        ? 'You have already submitted this assessment.'
        : `You have used all ${maxAttempts} attempts for this assessment.`,
      status: 409,
    }
  }
  const attempt = { current, attemptNo: used + 1, maxAttempts }

  if (tokens.inviteToken) {
    const invite = (await db.collection('candidate_invites').findOne({ token: tokens.inviteToken })) as Doc | null
    if (!invite) return { ok: false, error: 'Invalid invitation token', status: 403 }
    if (String(invite.email || '').toLowerCase() !== email) {
      return { ok: false, error: 'Email mismatch — this invitation belongs to a different account.', status: 403 }
    }
    if (!inviteCoversExam(invite, examId)) {
      return { ok: false, error: 'This invitation is for a different assessment.', status: 403 }
    }
    if (invite.status === 'expired' || invite.status === 'revoked') {
      return { ok: false, error: 'This invitation has expired.', status: 403 }
    }
    const invExp = invite.expires_at ? new Date(String(invite.expires_at)).getTime() : NaN
    if (!Number.isNaN(invExp) && now > invExp + INVITE_SUBMIT_GRACE_MS) {
      return { ok: false, error: 'This invitation has expired.', status: 403 }
    }
    // status 'used' with no prior submission is the recovery case (a failed
    // earlier save); `prior` above already rejects real re-use.
    return { ok: true, invite, source: 'invite', ...attempt }
  }

  if (tokens.linkToken) {
    const link = (await db.collection('assessment_links').findOne({ exam_id: examId, token: tokens.linkToken })) as Doc | null
    if (!link || link.revoked) return { ok: false, error: 'This link has expired or been revoked.', status: 403 }
    const linkExp = link.expires_at ? new Date(String(link.expires_at)).getTime() : NaN
    if (!Number.isNaN(linkExp) && now > linkExp + INVITE_SUBMIT_GRACE_MS) {
      return { ok: false, error: 'This link has expired.', status: 403 }
    }
    // max_uses counts distinct accounts, claimed atomically when the attempt
    // starts (page loads and refreshes no longer spend uses).
    const max = Number(link.max_uses)
    if (Number.isFinite(max) && max > 0) {
      const usedBy = Array.isArray(link.used_by) ? (link.used_by as unknown[]).map(String) : []
      if (!usedBy.includes(user.id)) {
        if (!opts.claimLinkUse) {
          if (usedBy.length >= max) return { ok: false, error: 'This link has reached its usage limit.', status: 403 }
        } else {
          const claimed = await db.collection('assessment_links').updateOne(
            { id: link.id, used_by: { $ne: user.id }, $expr: { $lt: [{ $size: { $ifNull: ['$used_by', []] } }, max] } },
            { $addToSet: { used_by: user.id }, $inc: { used_count: 1 } },
          )
          if (claimed.modifiedCount !== 1) return { ok: false, error: 'This link has reached its usage limit.', status: 403 }
        }
      }
    }
    return { ok: true, invite: null, source: 'link', ...attempt }
  }

  if ((exam.access_type || 'invite_only') !== 'open') {
    return { ok: false, error: INVITE_ONLY_MESSAGE, status: 403 }
  }
  if (exam.require_token_links === true) {
    return { ok: false, error: 'This test needs a personal link. Use the link from your invite email, or ask the organiser for one.', status: 403 }
  }
  return { ok: true, invite: null, source: 'open', ...attempt }
}

// ─── Proctoring events ───────────────────────────────────────────────────────

/**
 * Informational proctor events: logged for the timeline but never counted as
 * integrity flags (an extension heartbeat, a timer warning or a "face
 * verified" is not a risk signal).
 */
export const PROCTOR_INFO_EVENT_TYPES: readonly string[] = [
  'answer_pattern_score', 'timer_warning_30min', 'hardware_port_audit', 'browser_fingerprint_captured',
  'keyboard_dynamics_snapshot', 'face_match_restored', 'tab_focus', 'window_focus', 'fullscreen_enter',
  'viewport_restored', 'screen_share_started', 'eye_blink_detected', 'usb_device_unplugged',
  'identity_check_completed',
]

export function isRiskProctorEvent(type: unknown): boolean {
  return typeof type === 'string' && !PROCTOR_INFO_EVENT_TYPES.includes(type)
}

/**
 * Proctor event `meta` as stored: flat primitives only, at most 30 keys,
 * strings capped at 500 chars — the browser controls it, and reviewers'
 * reports render it.
 */
export function sanitizeProctorMeta(raw: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Doc).slice(0, 30)) {
    const key = k.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64)
    if (!key) continue
    if (v === null || typeof v === 'boolean') out[key] = v
    else if (typeof v === 'number') out[key] = Number.isFinite(v) ? v : null
    else if (typeof v === 'string') out[key] = v.slice(0, 500)
    else if (Array.isArray(v)) out[key] = v.slice(0, 20).map((x) => (typeof x === 'object' ? '' : String(x).slice(0, 60))).join(', ').slice(0, 500)
    else if (typeof v === 'object') out[key] = JSON.stringify(v).slice(0, 500)
  }
  return out
}

// ─── Invite targets (admin invite creation) ──────────────────────────────────

/** Exam id from an invite `target_url` such as `/assessment/<id>`, `/assessment/<id>/cad?x=1` or a full URL. */
export function examIdFromTargetUrl(targetUrl: unknown): string | null {
  const raw = String(targetUrl ?? '').trim()
  if (!raw) return null
  let path = raw
  try { path = new URL(raw, 'http://local').pathname } catch { /* keep raw */ }
  const m = path.match(/^\/(?:assessment|exams|dashboard\/assessments)\/([A-Za-z0-9_-]{1,128})(?:\/|$)/)
  return m ? m[1] : null
}

/**
 * Exam ids named by `assigned_assessments` steps (objects with `exam_id` or a
 * `target_url`, or plain id strings). Steps that point at no exam (identity,
 * coding practice, a bare /assessment) are skipped; a step whose target_url
 * looks like an exam route but has no parseable id returns null (reject).
 */
function assignedExamIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const step of raw.slice(0, 50)) {
    if (typeof step === 'string') { if (step.trim()) out.push(step.trim()); continue }
    if (!step || typeof step !== 'object') continue
    const st = step as Doc
    if (typeof st.exam_id === 'string' && st.exam_id) { out.push(st.exam_id); continue }
    const id = examIdFromTargetUrl(st.target_url)
    if (id) out.push(id)
    else if (/^\/(assessment|exams)\/./.test(String(st.target_url ?? ''))) return null
  }
  return out
}

/**
 * Who may invite to what: every exam an invite points at (target_url and
 * assigned_assessments) must exist and belong to the inviter's tenant
 * (superadmin: any). A target_url that names no exam is rejected unless it is
 * a same-site path outside the exam routes. Returns the exam id to store on
 * the invite as `exam_id` (the first target), so entry checks match exactly.
 */
export async function checkInviteTargets(
  db: Db,
  user: Pick<APIUser, 'role' | 'tenantId'>,
  input: { target_url?: unknown; assigned_assessments?: unknown },
): Promise<{ ok: true; examId: string | null } | { ok: false; error: string; status: number }> {
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') return { ok: false, error: 'Forbidden', status: 403 }
  const target = String(input.target_url ?? '').trim()
  if (target && !target.startsWith('/')) return { ok: false, error: 'Invite link must be a path on this site.', status: 400 }
  if (target.startsWith('//')) return { ok: false, error: 'Invite link must be a path on this site.', status: 400 }
  const fromTarget = examIdFromTargetUrl(target)
  const assigned = assignedExamIds(input.assigned_assessments)
  if (assigned === null) return { ok: false, error: 'An assigned step does not point at an assessment.', status: 400 }
  const ids = [...new Set([...(fromTarget ? [fromTarget] : []), ...assigned])]
  if (ids.length === 0) {
    // Generic (no exam) invites are a platform-level thing.
    return user.role === 'superadmin' ? { ok: true, examId: null } : { ok: false, error: 'Choose an assessment to invite to.', status: 400 }
  }
  const found = (await db.collection('exams').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, tenant_id: 1 } }).toArray()) as Doc[]
  if (found.length !== ids.length) return { ok: false, error: 'Assessment not found', status: 404 }
  if (!found.every((e) => isTenantStaff(user, e))) return { ok: false, error: 'Forbidden - resource belongs to another tenant', status: 403 }
  return { ok: true, examId: ids[0] }
}

// ─── Server-side attempt timer ───────────────────────────────────────────────
//
// POST /api/exams/[id]/start records the attempt start once per attempt in
// `exam_drafts` (keep-or-set, like the CAD start). The deadline is
// start + duration, capped at the exam's `ends_at`. Submit and save-draft
// read it back; the browser only displays the remaining time.

/** Network / auto-submit slack after the deadline before answers stop being accepted. */
export const EXAM_SUBMIT_GRACE_MS = 2 * 60_000

function msOf(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN
  return new Date(String(v)).getTime()
}

/** Deadline (epoch ms) for an attempt started at `startedAt`, or null when the exam is untimed and has no end date. */
export function attemptDeadlineMs(exam: Doc, startedAt: string | number): number | null {
  const start = typeof startedAt === 'number' ? startedAt : msOf(startedAt)
  if (Number.isNaN(start)) return null
  const minutes = Number(exam.duration)
  const byDuration = Number.isFinite(minutes) && minutes > 0 ? start + minutes * 60_000 : NaN
  const endsAt = msOf(exam.ends_at)
  const candidates = [byDuration, endsAt].filter((n) => !Number.isNaN(n))
  return candidates.length ? Math.min(...candidates) : null
}

export type AttemptTimeState =
  | { status: 'not_started' }
  | { status: 'running'; startedAt: string; deadline: number | null; remainingMs: number | null }
  | { status: 'expired'; startedAt: string; deadline: number }

/**
 * Where the candidate's current attempt stands. `draft` is the exam_drafts
 * doc; it only counts when it belongs to `attemptNo` (an earlier attempt's
 * start never carries over to a retake). `expired` means past deadline + grace.
 */
export function attemptTimeState(
  exam: Doc,
  draft: Doc | null | undefined,
  attemptNo: number,
  now: number = Date.now(),
  graceMs: number = EXAM_SUBMIT_GRACE_MS,
): AttemptTimeState {
  const startedAt = draft && Number(draft.attempt_no) === attemptNo && typeof draft.attempt_started_at === 'string'
    ? draft.attempt_started_at : null
  if (!startedAt || Number.isNaN(msOf(startedAt))) return { status: 'not_started' }
  const deadline = attemptDeadlineMs(exam, startedAt)
  if (deadline === null) return { status: 'running', startedAt, deadline: null, remainingMs: null }
  if (now > deadline + graceMs) return { status: 'expired', startedAt, deadline }
  return { status: 'running', startedAt, deadline, remainingMs: Math.max(0, deadline - now) }
}

/**
 * Record (or resume) the server start of attempt `attemptNo`. Atomic
 * keep-or-set: concurrent starts and reloads all get the first start time;
 * a new attempt gets a fresh start and an empty server draft.
 */
export async function startExamAttempt(db: Db, examId: string, userId: string, attemptNo: number): Promise<Doc> {
  const now = new Date().toISOString()
  const same = { $eq: ['$attempt_no', attemptNo] }
  const doc = await db.collection('exam_drafts').findOneAndUpdate(
    { exam_id: examId, user_id: userId },
    [{
      $set: {
        attempt_started_at: { $cond: [same, { $ifNull: ['$attempt_started_at', now] }, now] },
        answers: { $cond: [same, { $ifNull: ['$answers', { $literal: {} }] }, { $literal: {} }] },
        submitted_at: { $cond: [same, '$submitted_at', '$$REMOVE'] },
        // Section clocks belong to one attempt (a retake starts them afresh).
        sections_state: { $cond: [same, '$sections_state', '$$REMOVE'] },
        attempt_no: attemptNo,
        updated_at: now,
        created_at: { $ifNull: ['$created_at', now] },
      },
    }],
    { upsert: true, returnDocument: 'after', projection: { _id: 0 } },
  )
  return (doc as Doc | null) ?? { attempt_no: attemptNo, attempt_started_at: now, answers: {} }
}

export async function getExamDraft(db: Db, examId: string, userId: string): Promise<Doc | null> {
  return (await db.collection('exam_drafts').findOne({ exam_id: examId, user_id: userId }, { projection: { _id: 0 } })) as Doc | null
}

// ─── Sections: server-side section clocks ────────────────────────────────────
//
// The rules live in lib/exam-sections.ts (pure); this applies them to the
// running attempt's draft. Every write is conditional on the state version it
// read (sections_state.v), so two tabs can't interleave a switch.

export type SectionOp = { kind: 'sync' } | { kind: 'enter'; sectionId: string }

export type SectionUpdateResult =
  | { ok: true; sections: ExamSection[]; state: SectionsState; answers: Record<string, unknown>; deadline: number | null }
  | { ok: false; error: string; status: number; sections?: ExamSection[]; state?: SectionsState }

/**
 * Apply the section clock (and optionally a section switch and new answers)
 * to the attempt in progress and save it. `incoming` answers are kept only for
 * the section the candidate is in (after the clock is applied, before the
 * switch). Tests without sections: { ok: false, status: 400 }.
 */
export async function applySectionUpdate(
  db: Db,
  exam: Doc,
  userId: string,
  attemptNo: number,
  op: SectionOp,
  incoming: Record<string, unknown> | null = null,
  now: number = Date.now(),
): Promise<SectionUpdateResult> {
  const sections = resolveSections(exam)
  if (sections.length === 0) return { ok: false, error: 'This test has no sections.', status: 400 }
  const examId = String(exam.id)
  for (let attempt = 0; attempt < 2; attempt++) {
    const draft = await getExamDraft(db, examId, userId)
    const time = attemptTimeState(exam, draft, attemptNo, now)
    if (time.status !== 'running' || draft?.submitted_at) {
      return { ok: false, error: time.status === 'expired' ? 'Time is up for this attempt.' : 'No attempt in progress.', status: 409 }
    }
    const raw = draft?.sections_state as Doc | undefined
    const rawV = raw && typeof raw === 'object' && typeof raw.v === 'number' ? raw.v : undefined
    const parsed = parseSectionsState(raw, sections)
    // First sync of the attempt: the first section starts with the attempt.
    const startMs = parsed ? now : Math.min(now, Date.parse(time.startedAt) || now)
    let state = parsed ?? initSectionsState(sections, startMs, time.deadline)
    state = advanceSections(state, sections, now, time.deadline, EXAM_SUBMIT_GRACE_MS).state

    const stored = draft?.answers && typeof draft.answers === 'object' ? (draft.answers as Record<string, unknown>) : {}
    const answers = incoming ? mergeSectionAnswers(stored, incoming, editableQuestionIds(state, sections)) : stored

    if (op.kind === 'enter') {
      const r = enterSection(state, sections, op.sectionId, now, time.deadline, EXAM_SUBMIT_GRACE_MS)
      if (!r.ok) return { ok: false, error: r.error, status: 409, sections, state: r.state }
      state = r.state
    }

    const next: SectionsState = { ...state, v: (rawV ?? 0) + 1 }
    const res = await db.collection('exam_drafts').updateOne(
      {
        exam_id: examId, user_id: userId, attempt_no: attemptNo, submitted_at: { $exists: false },
        'sections_state.v': rawV === undefined ? { $exists: false } : rawV,
      },
      { $set: { sections_state: next, ...(incoming ? { answers } : {}), updated_at: new Date(now).toISOString() } },
    )
    if (res.matchedCount === 1) return { ok: true, sections, state: next, answers, deadline: time.deadline }
  }
  return { ok: false, error: 'Your test was updated in another tab. Reload to continue.', status: 409 }
}

/**
 * Submit-time view of the sections (no write): the clock applied to the
 * stored state, and the answers to keep — stored ones everywhere, the
 * browser's only for the current open section. Null when the test has no sections.
 */
export function sectionsAtSubmit(
  exam: Doc,
  draft: Doc | null | undefined,
  incoming: Record<string, unknown>,
  deadline: number | null,
  now: number = Date.now(),
): { sections: ExamSection[]; state: SectionsState; answers: Record<string, unknown> } | null {
  const sections = resolveSections(exam)
  if (sections.length === 0) return null
  const parsed = parseSectionsState(draft?.sections_state, sections)
  const stored = draft?.answers && typeof draft.answers === 'object' ? (draft.answers as Record<string, unknown>) : {}
  // An attempt that never synced sections (started before they were added): first section only.
  const base = parsed ?? initSectionsState(sections, now, deadline)
  const state = advanceSections(base, sections, now, deadline, EXAM_SUBMIT_GRACE_MS).state
  return { sections, state, answers: mergeSectionAnswers(stored, incoming, editableQuestionIds(state, sections)) }
}

/**
 * Per-section scores of a submission: the sections as the candidate took them
 * (stored at submit), else the test's current sections. [] = no sections.
 */
export function submissionSectionScores(exam: Doc, sub: Doc): SectionScore[] {
  const stored = Array.isArray(sub.sections) ? normalizeSections(sub.sections) : []
  const sections = stored.length ? stored : resolveSections(exam)
  if (!sections.length) return []
  const questions = (Array.isArray(exam.questionList) ? exam.questionList : []) as Doc[]
  const details = (Array.isArray(sub.details) ? sub.details : []) as Doc[]
  return sectionScores(sections, questions, details, isScoredType)
}

// ─── Update allow-list ───────────────────────────────────────────────────────

/** Fields an exam editor may change. Never id, _id, tenant_id, created_by, attempts/stats. */
export const EXAM_EDITABLE_FIELDS = [
  'title', 'subject', 'level', 'difficulty_level', 'description', 'duration', 'passing_score',
  'starts_at', 'ends_at', 'require_token_links', 'require_id_verification', 'require_face_capture',
  'cert_template', 'degree_type', 'branch', 'screening_type', 'techStack',
  'questions', 'questionList', 'published', 'access_type', 'status', 'allow_retake', 'max_attempts',
  'issue_certificates', 'proctoring_mode', 'kind', 'cad_points', 'no_camera_policy', 'sections',
] as const

/** Coerce `sections` from an editor body (call after pickFields). Question ids are re-checked when read (resolveSections). */
export function normalizeSectionFields(data: Doc): void {
  if ('sections' in data) data.sections = normalizeSections(data.sections)
}

// ─── Identity check (ID photo + live face photo) ─────────────────────────────
//
// Per test: `require_id_verification` / `require_face_capture` (missing = on,
// so new tests get the full check) and `no_camera_policy` for candidates whose
// machine has no usable camera. The candidate page runs the check, POSTs it to
// /api/exams/[id]/identity, and start/submit refuse an attempt without a
// stored result that satisfies the test's settings.

/** 'block' = no camera, no test. 'allow_flag' (default) = upload an ID photo and continue; flagged for manual review. */
export type NoCameraPolicy = 'block' | 'allow_flag'

export interface ExamIdentityPolicy {
  requireId: boolean
  requireFace: boolean
  /** True when the test asks for any identity capture. */
  required: boolean
  noCamera: NoCameraPolicy
}

export function examIdentityPolicy(exam: Doc): ExamIdentityPolicy {
  const requireId = exam.require_id_verification !== false
  const requireFace = exam.require_face_capture !== false
  return {
    requireId,
    requireFace,
    required: requireId || requireFace,
    noCamera: exam.no_camera_policy === 'block' ? 'block' : 'allow_flag',
  }
}

/** Coerce the no-camera setting from an editor body (call after pickFields). */
export function normalizeIdentityFields(data: Doc): void {
  if ('no_camera_policy' in data) data.no_camera_policy = data.no_camera_policy === 'block' ? 'block' : 'allow_flag'
  if ('require_id_verification' in data) data.require_id_verification = data.require_id_verification !== false
  if ('require_face_capture' in data) data.require_face_capture = data.require_face_capture !== false
}

export type IdentityStep =
  /** Nothing to capture (consent only). */
  | { kind: 'none' }
  /** Webcam flow: ID card photo and/or live face photo. */
  | { kind: 'camera'; requireId: boolean; requireFace: boolean }
  /** No camera, test allows it: upload an ID photo; the attempt is flagged for manual review. */
  | { kind: 'upload_id' }
  /** No camera and the test needs one. */
  | { kind: 'blocked' }

/** What the candidate has to do, given the test's settings and whether a camera works. */
export function identityRequirement(policy: ExamIdentityPolicy, cameraAvailable: boolean): IdentityStep {
  if (!policy.required) return { kind: 'none' }
  if (cameraAvailable) return { kind: 'camera', requireId: policy.requireId, requireFace: policy.requireFace }
  return policy.noCamera === 'block' ? { kind: 'blocked' } : { kind: 'upload_id' }
}

export const NO_CAMERA_REVIEW_LABEL = 'No camera — needs manual identity review'

export type IdentityMethod = 'camera' | 'no_camera_upload' | 'consent_only'

/** Stored identity result for one attempt (collection `exam_identity_checks`). */
export interface IdentityCheckRecord {
  method: IdentityMethod
  id_photo?: string | null
  face_photo?: string | null
}

/**
 * Server rule used by start and submit: does the stored identity result for
 * this attempt satisfy the test? `record` null = the candidate never ran it.
 */
export function identityCheckSatisfies(
  policy: ExamIdentityPolicy,
  record: IdentityCheckRecord | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!policy.required) return { ok: true }
  if (!record) return { ok: false, error: 'Complete the identity check before you start.' }
  if (record.method === 'camera') {
    if (policy.requireId && !record.id_photo) return { ok: false, error: 'Your ID photo is missing. Redo the identity check.' }
    if (policy.requireFace && !record.face_photo) return { ok: false, error: 'Your face photo is missing. Redo the identity check.' }
    return { ok: true }
  }
  if (record.method === 'no_camera_upload') {
    if (policy.noCamera !== 'allow_flag') return { ok: false, error: 'This test needs a working camera.' }
    if (!record.id_photo) return { ok: false, error: 'Upload a photo of your ID to continue.' }
    return { ok: true }
  }
  return { ok: false, error: 'Complete the identity check before you start.' }
}

const IDENTITY_COLLECTION = 'exam_identity_checks'

/** The stored identity result for this attempt, or null. */
export async function getIdentityCheck(db: Db, examId: string, userId: string, attemptNo: number): Promise<Doc | null> {
  return (await db.collection(IDENTITY_COLLECTION).findOne(
    { exam_id: examId, user_id: userId, attempt_no: attemptNo },
    { projection: { _id: 0 } },
  )) as Doc | null
}

/** Store (replace) the identity result for one attempt. */
export async function saveIdentityCheck(db: Db, doc: Doc & { exam_id: string; user_id: string; attempt_no: number }): Promise<void> {
  await ensureExamIndexes(db)
  await db.collection(IDENTITY_COLLECTION).replaceOne(
    { exam_id: doc.exam_id, user_id: doc.user_id, attempt_no: doc.attempt_no },
    doc,
    { upsert: true },
  )
}

/** Start / submit gate: loads the attempt's identity result and applies identityCheckSatisfies. */
export async function checkIdentityForAttempt(
  db: Db,
  exam: Doc,
  userId: string,
  attemptNo: number,
): Promise<{ ok: true; record: Doc | null } | { ok: false; error: string; status: number }> {
  const policy = examIdentityPolicy(exam)
  const record = policy.required ? await getIdentityCheck(db, String(exam.id), userId, attemptNo) : null
  const verdict = identityCheckSatisfies(policy, record as IdentityCheckRecord | null)
  return verdict.ok ? { ok: true, record } : { ok: false, error: verdict.error, status: 403 }
}

/** Summary copied onto the submission for reviewers (no photos; those go in id_photo / face_photo). */
export function identitySummary(record: Doc | null | undefined): Doc | null {
  if (!record) return null
  return {
    method: record.method ?? null,
    needs_manual_review: record.needs_manual_review === true,
    no_camera_reason: record.no_camera_reason ?? null,
    face_match: record.face_match ?? null,
    upload_scan_status: record.upload_scan_status ?? null,
    checked_at: record.updated_at ?? record.created_at ?? null,
  }
}

/**
 * Advisory face-match result reported by the browser (face-api 128-d
 * descriptors of the ID photo and the selfie). Never used to accept or reject
 * anyone; reviewers see it next to the photos.
 */
export function sanitizeFaceMatch(raw: unknown): Doc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Doc
  const status = ['compared', 'no_face_in_id', 'no_face_in_selfie', 'unavailable'].includes(String(r.status)) ? String(r.status) : null
  if (!status) return null
  if (status !== 'compared') return { status, advisory: true }
  const distance = Number(r.distance)
  if (!Number.isFinite(distance) || distance < 0 || distance > 2) return { status: 'unavailable', advisory: true }
  const threshold = 0.6
  return {
    status,
    distance: Math.round(distance * 1000) / 1000,
    similarity: Math.round(Math.max(0, Math.min(1, 1 - distance)) * 100) / 100,
    threshold,
    likely_match: distance < threshold,
    model: 'face-api-128d',
    advisory: true,
  }
}

// ─── Certificates: who may revoke ────────────────────────────────────────────

/**
 * Superadmin: any certificate. Tenant admin: only certificates issued for an
 * exam (`certification_id` = exam id) that belongs to their own tenant. A
 * missing tenantId / exam / tenant_id never matches.
 */
export function canRevokeExamCertificate(
  user: Pick<APIUser, 'role' | 'tenantId'> | null | undefined,
  cert: Doc | null | undefined,
  exam: Doc | null | undefined,
): boolean {
  if (!user || !cert) return false
  if (user.role === 'superadmin') return true
  if (user.role !== 'tenant_admin' || !user.tenantId) return false
  if (!exam || !exam.id || cert.certification_id !== exam.id) return false
  return !!exam.tenant_id && exam.tenant_id === user.tenantId
}

// ─── Proctoring mode / exam kind ─────────────────────────────────────────────

export type ProctoringMode = 'standard' | 'strict'

/**
 * `strict` requires the Device Audit browser extension before a candidate can
 * start. `standard` (the default, and what every exam saved before this
 * setting existed gets) recommends it but lets candidates without it in —
 * mobile, Safari, Firefox. Integrity events are logged either way.
 */
export function examProctoringMode(exam: Doc): ProctoringMode {
  return exam.proctoring_mode === 'strict' ? 'strict' : 'standard'
}

export function extensionRequired(exam: Doc): boolean {
  return examProctoringMode(exam) === 'strict'
}

/** `cad` exams are taken at /assessment/[id]/cad (file upload + rationale). */
export function isCadExam(exam: Doc): boolean {
  return exam.kind === 'cad'
}

/** Coerce proctoring / kind settings from an editor body (call after pickFields). */
export function normalizeProctoringFields(data: Doc): void {
  if ('proctoring_mode' in data) data.proctoring_mode = data.proctoring_mode === 'strict' ? 'strict' : 'standard'
  if ('kind' in data) data.kind = data.kind === 'cad' ? 'cad' : 'standard'
  if ('cad_points' in data) {
    const n = Math.round(Number(data.cad_points))
    if (Number.isFinite(n) && n >= 1) data.cad_points = Math.min(1000, n)
    else delete data.cad_points
  }
}

/** Pass mark used when an exam has never stored `passing_score` (matches the release routes). */
export const DEFAULT_PASS_PERCENT = 40
/** Pass mark pre-filled for new exams on the create screen. */
export const NEW_EXAM_PASS_PERCENT = 60

/** The exam's pass mark in percent (0–100); also the certificate threshold. */
export function examPassPercent(exam: Doc): number {
  const n = Number(exam.passing_score)
  return Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : DEFAULT_PASS_PERCENT
}

/** Coerce pass-mark / certificate settings from an editor body (call after pickFields). */
export function normalizeCertificateFields(data: Doc): void {
  if ('issue_certificates' in data) data.issue_certificates = data.issue_certificates !== false
  if ('passing_score' in data) {
    const n = Math.round(Number(data.passing_score))
    if (Number.isFinite(n)) data.passing_score = Math.max(0, Math.min(100, n))
    else delete data.passing_score
  }
}

export function pickFields(body: unknown, allowed: readonly string[]): Doc {
  const out: Doc = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out
  const src = body as Doc
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k]
  return out
}

// ─── Codeathons ──────────────────────────────────────────────────────────────

/** Codeathon fields an editor may change (see POST /api/codeathons for the shape). */
export const CODEATHON_EDITABLE_FIELDS = [
  'title', 'description', 'difficulty', 'topics', 'rules', 'maxParticipants', 'startDate', 'endDate',
  'status', 'prizePool', 'cert_template', 'problems', 'event_type', 'team_size_min', 'team_size_max',
  'problem_visibility', 'tracks',
] as const

/** Participant view of a codeathon problem: hidden test cases removed. */
export function publicCodeathonProblem(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object') return {}
  const p = { ...(raw as Doc) }
  for (const k of ['solution', 'solutions', 'editorial_solution', 'reference_solution', 'hidden_test_cases']) delete p[k]
  if (Array.isArray(p.test_cases)) {
    p.test_cases = (p.test_cases as Doc[]).filter((tc) => tc && tc.hidden !== true && tc.isSample !== false)
  }
  return p
}

export function publicCodeathonView(doc: Doc): Doc {
  return Array.isArray(doc.problems) ? { ...doc, problems: doc.problems.map(publicCodeathonProblem) } : doc
}
