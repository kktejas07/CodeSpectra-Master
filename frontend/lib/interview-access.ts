/**
 * Who may read / write a live interview session, and what each may change.
 * Shared by app/api/interviews/[id]/** so the rules can't drift per route.
 */
import type { APIUser } from '@/lib/route-auth'

type Doc = Record<string, unknown>

export type InterviewRole = 'interviewer' | 'candidate' | 'staff'

/**
 * - interviewer: the session's interviewer
 * - staff: superadmin, or a tenant_admin of the session's own tenant
 *   (a missing tenantId on either side never matches)
 * - candidate: the session's candidate
 * Anyone else gets null (no access).
 */
export function interviewRole(user: Pick<APIUser, 'id' | 'role' | 'tenantId'> | null | undefined, session: Doc): InterviewRole | null {
  if (!user) return null
  if (session.interviewer_id && session.interviewer_id === user.id) return 'interviewer'
  if (user.role === 'superadmin') return 'staff'
  if (user.role === 'tenant_admin' && !!user.tenantId && session.tenant_id === user.tenantId) return 'staff'
  if (session.candidate_id && session.candidate_id === user.id) return 'candidate'
  return null
}

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined
}

function score(v: unknown): number | undefined {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined
}

function sanitizeFeedback(raw: unknown): Doc[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.slice(0, 20).flatMap((f) => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return []
    const r = f as Doc
    const dimension = str(r.dimension, 100)
    const s = score(r.score)
    if (!dimension || s === undefined) return []
    return [{
      dimension,
      score: s,
      feedback: str(r.feedback, 5000) ?? '',
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.slice(0, 10).map((x) => String(x ?? '').slice(0, 500)) : [],
    }]
  })
}

function sanitizeQuestions(raw: unknown): Doc[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.slice(0, 100).flatMap((q, i) => {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return []
    const r = q as Doc
    const question = str(r.question, 5000)
    const id = str(r.id, 80)
    if (!question || !id) return []
    const out: Doc = {
      id,
      question,
      category: str(r.category, 100) || 'General',
      difficulty: (DIFFICULTIES as readonly string[]).includes(String(r.difficulty)) ? r.difficulty : 'Medium',
      order: Number.isFinite(Number(r.order)) ? Number(r.order) : i,
      time_limit_seconds: Math.max(10, Math.min(7200, Number(r.time_limit_seconds) || 60)),
    }
    const answer = str(r.answer, 50000)
    if (answer !== undefined) out.answer = answer
    if (Number.isFinite(Number(r.time_spent_seconds))) out.time_spent_seconds = Math.max(0, Number(r.time_spent_seconds))
    if (typeof r.skipped === 'boolean') out.skipped = r.skipped
    const follow = str(r.ai_follow_up, 5000)
    if (follow !== undefined) out.ai_follow_up = follow
    return [out]
  })
}

/**
 * The `$set` a PATCH may apply. Interviewer/staff: status, notes, feedback,
 * score, schedule, questions (all type-checked). Candidate: only start the
 * session (status → in_progress). Returns an error string when the caller
 * tried to change something their role can't.
 */
export function interviewPatch(role: InterviewRole, body: unknown, now: string): { set: Doc } | { error: string } {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Doc
  const set: Doc = { updated_at: now }
  const status = typeof b.status === 'string' && (STATUSES as readonly string[]).includes(b.status) ? b.status : undefined

  if (role === 'candidate') {
    const others = ['notes', 'feedback', 'overall_score', 'scheduled_at', 'questions'].filter((k) => b[k] !== undefined)
    if (others.length > 0 || (status && status !== 'in_progress')) return { error: 'Only the interviewer can change that.' }
    if (status) { set.status = status; set.started_at = now }
    return { set }
  }

  if (status) {
    set.status = status
    if (status === 'in_progress') set.started_at = now
    if (status === 'completed') set.completed_at = now
  }
  const notes = str(b.notes, 20000)
  if (notes !== undefined) set.notes = notes
  const feedback = sanitizeFeedback(b.feedback)
  if (feedback) set.feedback = feedback
  const overall = score(b.overall_score)
  if (b.overall_score !== undefined && overall !== undefined) set.overall_score = overall
  if (typeof b.scheduled_at === 'string' && !Number.isNaN(Date.parse(b.scheduled_at))) set.scheduled_at = new Date(b.scheduled_at).toISOString()
  const questions = sanitizeQuestions(b.questions)
  if (questions) set.questions = questions
  return { set }
}

// ─── Scheduling: who can be booked as the candidate (CORE-015) ─────────────

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

/** Lower-cased, trimmed e-mail, or null when it isn't one. */
export function normalizeCandidateEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null
}

/**
 * A scheduler may book any account that is not a member of ANOTHER
 * organisation: candidates (no tenant) or people in their own tenant.
 * Superadmins may book anyone. Pure.
 */
export function canScheduleCandidate(
  scheduler: { role: string; tenantId: string | null },
  candidateTenantId: string | null,
): boolean {
  if (scheduler.role === 'superadmin') return true
  return !candidateTenantId || candidateTenantId === scheduler.tenantId
}

/**
 * W4-16: the only answer when an interview candidate can't be used — the same
 * for an unknown e-mail, another organisation's member, or a bad id, so the
 * scheduling form can't be used to learn who has an account.
 */
export const CANDIDATE_UNAVAILABLE = "We couldn't schedule this interview for that candidate. Check the email address; the candidate needs a CodeSpectra account under that email (they can sign up or apply to one of your jobs first)."
