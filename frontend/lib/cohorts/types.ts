/**
 * Cohort courses: a dated run of an existing course (`courses` collection)
 * with a capacity, mentors / TAs, live sessions, assignments and a
 * completion certificate. Client-safe types only.
 */
import type { MeetingProvider } from '@/lib/ats/contract'

export const COHORT_STATUSES = ['draft', 'open', 'running', 'completed', 'archived'] as const
export type CohortStatus = (typeof COHORT_STATUSES)[number]

export const STAFF_ROLES = ['mentor', 'ta'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export type MemberRole = 'learner' | StaffRole

export const SESSION_PROVIDERS = ['livekit', 'zoom', 'google_meet', 'teams', 'manual'] as const satisfies readonly MeetingProvider[]

export interface WeeklySlot { dow: number; start: string; duration_min: number }

export interface CohortAccess {
  /** Anyone signed in may join (until capacity). */
  free: boolean
  /** Learners whose plan has the `cohort_courses` entitlement join without paying. */
  entitlement: boolean
  /** Learners holding a live licence seat of one of these organisations join without paying. */
  licence_org_ids: string[]
  /** Marketplace product that sells a seat (a paid order for it grants enrolment). */
  marketplace_product_id: string | null
  /** Display price (the marketplace product carries the real price). Minor units. */
  price_minor: number | null
  currency: 'INR' | 'USD'
}

export interface CompletionRule {
  /** % of live sessions attended (present or late; excused sessions don't count against). */
  min_attendance_pct: number
  /** Average final score across assignments, 0–100. */
  min_assignment_pct: number
  /** Every assignment must have a graded submission. */
  require_all_assignments: boolean
}

export interface CohortDoc {
  id: string
  course_id: string | null
  title: string
  summary: string
  skills: string[]
  tenant_id: string | null
  starts_at: string
  ends_at: string
  timezone: string
  capacity: number
  enrolled_count: number
  status: CohortStatus
  access: CohortAccess
  schedule: { weekly: WeeklySlot[]; provider: MeetingProvider; manual_url: string | null; title_prefix: string }
  completion: CompletionRule
  created_by: string
  created_at: string
  updated_at: string
}

export interface CohortMemberDoc {
  id: string
  cohort_id: string
  user_id: string
  email: string
  name: string
  role: MemberRole
  /** Mentor marketplace profile (staff), shown on the cohort page. */
  mentor_slug: string | null
  status: 'active' | 'dropped' | 'completed'
  source: 'free' | 'entitlement' | 'licence' | 'order' | 'staff'
  order_id: string | null
  joined_at: string
  completed_at: string | null
  certificate_id: string | null
}

export interface CohortSessionDoc {
  id: string
  cohort_id: string
  title: string
  starts_at: string
  duration_min: number
  provider: MeetingProvider
  join_url: string | null
  meeting_id: string | null
  status: 'scheduled' | 'cancelled'
  recording_url: string | null
  created_at: string
  updated_at: string
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

export interface AttendanceDoc {
  id: string
  cohort_id: string
  session_id: string
  user_id: string
  status: AttendanceStatus
  source: 'join' | 'staff'
  at: string
}

export interface RubricItem { id: string; label: string; points: number; description: string }

export const ASSIGNMENT_FILE_TYPES = ['pdf', 'zip', 'docx', 'pptx', 'xlsx', 'image', 'text'] as const
export type AssignmentFileType = (typeof ASSIGNMENT_FILE_TYPES)[number]

export interface AssignmentTest { input: string; output: string; hidden?: true }

export interface AssignmentDoc {
  id: string
  cohort_id: string
  title: string
  instructions: string
  kind: 'code' | 'file'
  due_at: string
  /** Hours after the deadline a late submission is still accepted (0 = none). */
  late_hours: number
  /** % taken off a late submission's final score. */
  late_penalty_pct: number
  max_points: number
  language: string | null
  starter_code: string
  tests: AssignmentTest[]
  /** Code assignments: share of the final score from the autograder (rest from the rubric). */
  autograde_weight_pct: number
  file_types: AssignmentFileType[]
  rubric: RubricItem[]
  published: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface AutogradeResult { passed: number; total: number; pct: number; cases: { passed: boolean; hidden: boolean; error?: string }[] }

export interface SubmissionDoc {
  id: string
  assignment_id: string
  cohort_id: string
  user_id: string
  user_name: string
  attempt: number
  kind: 'code' | 'file'
  code: string | null
  language: string | null
  file: { id: string; name: string; size: number; type: string; scan: string; storage: 's3' | 'db'; s3_key?: string; data?: unknown; content_type: string } | null
  submitted_at: string
  late: boolean
  autograde: AutogradeResult | null
  status: 'submitted' | 'graded'
  grade: {
    rubric: Record<string, number>
    points: number
    max_points: number
    feedback: string
    graded_by: string
    graded_at: string
  } | null
  /** Final 0–100 score after autograde weighting and late penalty. */
  final_pct: number | null
}

export interface CohortCertificateDoc {
  id: string
  cohort_id: string
  user_id: string
  title: string
  skills: string[]
  score: number
  verify_token: string
  issued_at: string
}

export interface LearnerProgress {
  sessions_total: number
  sessions_attended: number
  attendance_pct: number
  assignments_total: number
  assignments_graded: number
  assignment_pct: number
  progress_pct: number
  eligible: boolean
  missing: ('attendance' | 'assignments' | 'score')[]
}
