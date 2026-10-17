/**
 * Server-side exam access + projection helpers shared by
 * GET /api/exams/[id], POST /api/exams/[id]/submit and the exam update routes.
 *
 * The candidate page (`app/assessment/[id]/page.tsx`) shows the same gates for
 * UX, but these are the ones that actually hold.
 */
import type { Db } from 'mongodb'
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
  | { ok: true; invite: Doc | null; source: 'invite' | 'link' | 'open' }
  | { ok: false; error: string; status: number }

/**
 * Enforces, on the server: published, availability window, invite-only access
 * (valid invite for this exam and account, or a valid ?link= token), and one
 * submission per candidate (`allow_retake: true` on the exam lifts that).
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
  const prior = await db.collection('exam_submissions').countDocuments({
    exam_id: examId,
    $or: [{ user_id: user.id }, ...(email ? [{ email: user.email }] : [])],
  })
  if (prior > 0 && exam.allow_retake !== true) {
    return { ok: false, error: 'You have already submitted this assessment.', status: 409 }
  }

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
    return { ok: true, invite, source: 'invite' }
  }

  if (tokens.linkToken) {
    const link = (await db.collection('assessment_links').findOne({ exam_id: examId, token: tokens.linkToken })) as Doc | null
    if (!link || link.revoked) return { ok: false, error: 'This link has expired or been revoked.', status: 403 }
    const linkExp = link.expires_at ? new Date(String(link.expires_at)).getTime() : NaN
    if (!Number.isNaN(linkExp) && now > linkExp + INVITE_SUBMIT_GRACE_MS) {
      return { ok: false, error: 'This link has expired.', status: 403 }
    }
    // max_uses is consumed by the entry GET (links?token=); not re-counted here.
    return { ok: true, invite: null, source: 'link' }
  }

  if ((exam.access_type || 'invite_only') !== 'open') {
    return { ok: false, error: 'This assessment is invite-only. A valid invitation link is required.', status: 403 }
  }
  return { ok: true, invite: null, source: 'open' }
}

// ─── Update allow-list ───────────────────────────────────────────────────────

/** Fields an exam editor may change. Never id, _id, tenant_id, created_by, attempts/stats. */
export const EXAM_EDITABLE_FIELDS = [
  'title', 'subject', 'level', 'difficulty_level', 'description', 'duration', 'passing_score',
  'starts_at', 'ends_at', 'require_token_links', 'require_id_verification', 'require_face_capture',
  'cert_template', 'degree_type', 'branch', 'screening_type', 'techStack',
  'questions', 'questionList', 'published', 'access_type', 'status', 'allow_retake',
] as const

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
