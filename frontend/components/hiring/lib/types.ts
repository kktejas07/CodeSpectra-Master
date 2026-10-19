/**
 * View shapes the hiring UI reads from /api/ats (built on lib/ats/contract.ts).
 * Optional fields are things the API may or may not include; the UI degrades.
 */
import type {
  AtsApplication,
  AtsCandidate,
  AtsClient,
  AtsInterview,
  AtsJob,
  AtsMember,
  CandidateSource,
  PipelineStage,
  ScreeningCall,
  StageResult,
} from '@/lib/ats/contract'

/** Slim candidate attached to approval rows. */
export type CandidateSummary = Pick<AtsCandidate, 'id' | 'name'> &
  Partial<Pick<AtsCandidate, 'email' | 'phone' | 'tags' | 'source' | 'parsed'>>

/** Candidate summary on a board card (GET /api/ats/jobs/[id]/board). */
export interface BoardCandidate {
  id: string
  name: string
  email: string | null
  phone: string | null
  country?: string | null
  total_years?: number | null
  location?: string | null
  skills: string[]
  titles: string[]
  tags: string[]
}

/** Board card (GET /api/ats/jobs/[id]/board). `candidate` is null if hidden from the viewer. */
export type BoardApplication = Pick<AtsApplication, 'id' | 'stage_id' | 'stage_entered_at' | 'status' | 'source' | 'match' | 'pending_move' | 'created_at'> & {
  last_result: StageResult | null
  rejection_reason?: string | null
  candidate: BoardCandidate | null
}

export interface BoardResponse {
  job: AtsJob
  stages: { stage: PipelineStage; applications: BoardApplication[] }[]
}

/** GET /api/ats/jobs row (clients get a trimmed job). */
export type JobListItem = AtsJob & {
  counts?: { total: number; active: number; hired: number; by_stage: Record<string, number> }
  pending_approvals?: number
}

/** GET /api/ats/applications/[id] (candidate is null if hidden from the viewer) */
export interface ApplicationDetail {
  application: AtsApplication
  candidate: AtsCandidate | null
  job: AtsJob
  interviews?: AtsInterview[]
  calls?: ScreeningCall[]
  /** the viewer's hiring role (UI hints only) */
  me?: { role: AtsMember['role'] }
}

/** GET /api/ats/approvals → { approvals: ApprovalItem[] } */
export interface ApprovalItem {
  application_id: string
  job: { id: string; title: string }
  candidate: { id: string; name: string }
  from: PipelineStage | null
  to: PipelineStage | null
  reason: string
  suggested_at: string
  /** match score, null for clients */
  match: number | null
}

export type CandidateListItem = AtsCandidate

/** GET /api/ats/candidates/[id] (applications come without history) */
export interface CandidateDetail {
  candidate: AtsCandidate
  applications: (Omit<AtsApplication, 'history'> & {
    job: { id: string; title: string; status: AtsJob['status'] } | null
    stage: PipelineStage | null
  })[]
}

/** One row of the funnel (lib/ats/analytics FunnelRow). */
export interface FunnelRow {
  /** stage id (one job) or stage type (all jobs) */
  key: string
  name: string
  type: string
  current: number
  reached: number
  conversion_pct: number | null
  median_days: number | null
}

/** GET /api/ats/analytics?job_id= (lib/ats/analytics AnalyticsReport). */
export interface AnalyticsResponse {
  job_id: string | null
  total: number
  active: number
  hired: number
  rejected: number
  funnel: FunnelRow[]
  time_to_hire_days: { median: number | null; average: number | null; count: number }
  source_mix: { source: string; count: number; pct: number }[]
  rejection_reasons: { reason: string; count: number }[]
  rejected_at: { key: string; name: string; count: number }[]
}

/** GET /api/ats/jobs/[id]/talent-pool → { candidates: TalentSuggestion[] } */
export interface TalentSuggestion {
  /** candidate id, or "user:<id>" for a past job-board applicant */
  id: string
  name: string
  kind: 'candidate' | 'past_applicant'
  score: number
  reasons: string[]
  missing_must: string[]
  skills: string[]
  total_years: number | null
  location: string | null
}

export interface ResumeUploadResult {
  file: string
  ok: boolean
  candidate_id?: string
  application_id?: string
  name?: string
  score?: number | null
  duplicate?: boolean
  error?: string
}

export type { AtsClient, AtsMember, AtsJob, AtsApplication, AtsCandidate, AtsInterview, ScreeningCall, PipelineStage }

/** Public job as returned by /api/ats/public/jobs — no internal fields. */
export interface PublicJob {
  id: string
  title: string
  company?: string | null
  company_logo?: string | null
  location?: string | null
  work_mode?: AtsJob['work_mode']
  employment_type?: AtsJob['employment_type']
  experience_min?: number | null
  experience_max?: number | null
  salary?: AtsJob['salary']
  description: string
  requirements?: string | null
  skills: string[]
  created_at?: string
}
