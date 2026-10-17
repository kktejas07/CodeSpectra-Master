/**
 * Server-side exam access + projection helpers shared by
 * GET /api/exams/[id], POST /api/exams/[id]/submit and the exam update routes.
 *
 * The candidate page (`app/assessment/[id]/page.tsx`) shows the same gates for
 * UX, but these are the ones that actually hold.
 */
import type { Db, ObjectId } from 'mongodb'
import type { APIUser } from '@/lib/route-auth'

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

function inviteCoversExam(invite: Doc, examId: string): boolean {
  if (invite.exam_id) return invite.exam_id === examId
  const target = String(invite.target_url || '')
  const assigned = Array.isArray(invite.assigned_assessments) ? (invite.assigned_assessments as unknown[]).map(String) : []
  if (!target && assigned.length === 0) return true // generic invite
  return target.includes(examId) || assigned.includes(examId)
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
export async function checkExamEntry(
  db: Db,
  exam: Doc,
  user: Pick<APIUser, 'id' | 'email'>,
  tokens: { inviteToken?: string | null; linkToken?: string | null },
): Promise<ExamAccessResult> {
  const examId = String(exam.id)
  const now = Date.now()

  if (!exam.published) return { ok: false, error: 'This assessment is not available.', status: 403 }
  const startsAt = exam.starts_at ? new Date(String(exam.starts_at)).getTime() : NaN
  if (!Number.isNaN(startsAt) && now < startsAt) {
    return { ok: false, error: 'This assessment has not opened yet.', status: 403 }
  }
  const endsAt = exam.ends_at ? new Date(String(exam.ends_at)).getTime() : NaN
  if (!Number.isNaN(endsAt) && now > endsAt) {
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
    // max_uses is consumed by the entry GET (links?token=); not re-counted here.
    return { ok: true, invite: null, source: 'link', ...attempt }
  }

  if ((exam.access_type || 'invite_only') !== 'open') {
    return { ok: false, error: INVITE_ONLY_MESSAGE, status: 403 }
  }
  return { ok: true, invite: null, source: 'open', ...attempt }
}

// ─── Update allow-list ───────────────────────────────────────────────────────

/** Fields an exam editor may change. Never id, _id, tenant_id, created_by, attempts/stats. */
export const EXAM_EDITABLE_FIELDS = [
  'title', 'subject', 'level', 'difficulty_level', 'description', 'duration', 'passing_score',
  'starts_at', 'ends_at', 'require_token_links', 'require_id_verification', 'require_face_capture',
  'cert_template', 'degree_type', 'branch', 'screening_type', 'techStack',
  'questions', 'questionList', 'published', 'access_type', 'status', 'allow_retake', 'max_attempts',
  'issue_certificates',
] as const

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
