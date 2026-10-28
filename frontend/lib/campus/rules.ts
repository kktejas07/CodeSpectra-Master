/**
 * Campus rules (pure, unit tested): drive eligibility, student verification
 * on join, and who may see what.
 */
import { normRollNo, onCollegeDomain, type EligibilityRules, type StudentDoc, type VerifiedVia } from './types'

export interface EligibilityStudent {
  status: StudentDoc['status']
  department_id: string | null
  cgpa: number | null
  backlogs: number
  graduation_year: number | null
}

/** Is this student eligible for a drive? Reasons are plain sentences for the student. */
export function checkEligibility(s: EligibilityStudent, r: EligibilityRules): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (s.status !== 'verified') reasons.push('Your college account is not verified yet')
  if (r.min_cgpa !== null && r.min_cgpa !== undefined) {
    if (s.cgpa === null) reasons.push(`Needs a CGPA of at least ${r.min_cgpa} — your CGPA is not on record`)
    else if (s.cgpa < r.min_cgpa) reasons.push(`Needs a CGPA of at least ${r.min_cgpa}`)
  }
  if (r.max_backlogs !== null && r.max_backlogs !== undefined && s.backlogs > r.max_backlogs) {
    reasons.push(r.max_backlogs === 0 ? 'Open to students with no backlogs' : `Open to students with at most ${r.max_backlogs} backlogs`)
  }
  if (r.department_ids.length && (!s.department_id || !r.department_ids.includes(s.department_id))) reasons.push('Not open to your department')
  if (r.graduation_years.length && (s.graduation_year === null || !r.graduation_years.includes(s.graduation_year))) reasons.push('Not open to your batch')
  return { eligible: reasons.length === 0, reasons }
}

export type JoinDecision =
  | { ok: true; status: 'verified'; via: VerifiedVia }
  | { ok: false; status: 400 | 403 | 409 | 410; error: string; needs_roll_no?: boolean }

/**
 * Accepting an invite. The token proves access to the invited mailbox; the
 * student is verified by a college email domain on their account, or by
 * entering the roll number the placement office has on record.
 */
export function decideInviteJoin(input: {
  record: Pick<StudentDoc, 'user_id' | 'roll_no' | 'invite_expires_at'>
  userId: string
  userEmail: string
  domains: readonly string[]
  rollNo?: unknown
  now?: Date
}): JoinDecision {
  const { record } = input
  const now = input.now ?? new Date()
  if (record.user_id && record.user_id !== input.userId) return { ok: false, status: 409, error: 'This invitation was already used by another account' }
  if (!record.user_id && record.invite_expires_at && Date.parse(record.invite_expires_at) < now.getTime()) {
    return { ok: false, status: 410, error: 'This invitation has expired — ask your placement office to send a new one' }
  }
  if (onCollegeDomain(input.userEmail, input.domains)) return { ok: true, status: 'verified', via: 'domain' }
  const entered = normRollNo(input.rollNo)
  if (!entered) return { ok: false, status: 400, error: 'Enter your roll number to verify', needs_roll_no: true }
  if (!record.roll_no || normRollNo(record.roll_no) !== entered) {
    return { ok: false, status: 403, error: 'That roll number does not match the one your placement office has', needs_roll_no: true }
  }
  return { ok: true, status: 'verified', via: 'roll_no' }
}

export type SelfJoinDecision =
  | { ok: true; action: 'link'; studentId: string }
  | { ok: true; action: 'create' }
  | { ok: false; status: 403 | 409; error: string }

/**
 * Joining without an invite: only with a college email on the account. A
 * matching record (same email) is linked; a roll number already on record
 * for someone else's email is never handed over.
 */
export function decideSelfJoin(input: {
  userId: string
  userEmail: string
  domains: readonly string[]
  byEmail: Pick<StudentDoc, 'id' | 'user_id'> | null
  byRoll: Pick<StudentDoc, 'id' | 'user_id' | 'email'> | null
}): SelfJoinDecision {
  if (!onCollegeDomain(input.userEmail, input.domains)) {
    return { ok: false, status: 403, error: 'Sign in with your college email, or use the invite link your placement office sent' }
  }
  const email = input.userEmail.toLowerCase()
  if (input.byEmail) {
    if (input.byEmail.user_id && input.byEmail.user_id !== input.userId) return { ok: false, status: 409, error: 'This college record is linked to another account' }
    return { ok: true, action: 'link', studentId: input.byEmail.id }
  }
  if (input.byRoll) {
    if (input.byRoll.email.toLowerCase() !== email || (input.byRoll.user_id && input.byRoll.user_id !== input.userId)) {
      return { ok: false, status: 409, error: 'That roll number is on record for another student — contact your placement office' }
    }
    return { ok: true, action: 'link', studentId: input.byRoll.id }
  }
  return { ok: true, action: 'create' }
}

/** A drive accepts applications now? */
export function driveAcceptsApplications(d: { status: string; schedule: { apply_by: string } }, now = new Date()): boolean {
  return d.status === 'open' && Date.parse(d.schedule.apply_by) >= now.getTime()
}
