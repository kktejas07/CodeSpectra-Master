/**
 * CodeSpectra hiring pipeline (ATS) — shared contract.
 *
 * Flow: job (requisition) → intake (apply page, bulk résumés, email/CSV, talent pool)
 *   → résumé parsing → screening by keywords + parameters → the job's own pipeline,
 *   e.g. assessment → phone/WhatsApp bot screen → virtual interview → F2F → client
 *   review → offer → hired. Each job configures its stages, order, pass rules and
 *   whether each move is automatic or needs approval.
 *
 * Parts built against this file:
 *  - lib/ats/core      data, jobs, intake, parsing, screening, pipeline engine, APIs
 *  - lib/ats/access    team roles (recruiter / interviewer / hiring manager / client)
 *  - lib/ats/interviews  virtual (LiveKit, Zoom, Google Meet, Microsoft Teams, manual
 *                      link) + face-to-face, panels, scorecards, scheduling
 *  - lib/ats/screening bot screening over WhatsApp chat, WhatsApp call and regional
 *                      phone numbers; transcripts + scoring
 *  - app/dashboard/hiring/**  recruiter / interviewer / client UI
 *
 * Rules:
 *  - Everything is tenant scoped. Who may do what comes from the session + the
 *    `ats_members` record (lib/ats/access), never from request bodies.
 *  - tenant_admin of the tenant (and superadmin) is always an ATS admin.
 *  - Candidate PII is visible only to members of that tenant; clients see only
 *    applications for their own client's jobs at client-visible stages.
 *  - Every stage change is recorded in history. Side effects (emails, invites, bot
 *    calls) are idempotent per (application, stage entry).
 */

// ─── Team & access ──────────────────────────────────────────────────────────

/** Per-tenant hiring role (stored in `ats_members`; independent of the global user role). */
export type AtsRole = 'admin' | 'recruiter' | 'hiring_manager' | 'interviewer' | 'client'

export interface AtsMember {
  id: string
  tenant_id: string
  user_id: string | null // null until the invite is accepted
  email: string
  name?: string
  role: AtsRole
  /** client role (and optional for hiring_manager): which client account they belong to */
  client_id?: string | null
  status: 'invited' | 'active' | 'disabled'
  invited_by: string
  created_at: string
}

export interface AtsActor {
  userId: string
  tenantId: string
  role: AtsRole
  clientId: string | null
  email: string
  name?: string
}
// Implemented in lib/ats/access.ts:
//   export async function getAtsActor(tenantId?: string): Promise<AtsActor | null>   (from session)
//   export async function requireAts(roles: AtsRole[], tenantId?: string): Promise<{ actor: AtsActor } | { error: string; status: number }>
//   export function canSeeApplication(actor: AtsActor, app: AtsApplication, job: AtsJob): boolean
//   export function canActOnStage(actor: AtsActor, stage: PipelineStage): boolean

/** A staffing client of the tenant (the company the tenant hires for). */
export interface AtsClient {
  id: string
  tenant_id: string
  name: string
  logo_url?: string | null
  contacts?: { name: string; email: string; phone?: string }[]
  created_at: string
}

// ─── Jobs (requisitions) ────────────────────────────────────────────────────

export type JobStatus = 'draft' | 'open' | 'on_hold' | 'closed' | 'filled'

export interface ScreeningCriteria {
  must_have_skills: string[]
  nice_to_have_skills: string[]
  /** extra keywords searched in the résumé text */
  keywords: string[]
  min_years?: number | null
  max_years?: number | null
  locations?: string[] // accepted locations ("remote" allowed)
  relocation_ok?: boolean
  max_notice_days?: number | null
  education?: string[] // e.g. ["B.Tech", "M.Tech", "MCA"]
  max_expected_salary?: number | null
  /** 0–100; candidates at or above are shortlisted, below go to on_fail */
  pass_score: number
  /** weights for the match score; defaults in core */
  weights?: Partial<Record<'must' | 'nice' | 'keywords' | 'years' | 'location' | 'notice' | 'education' | 'salary' | 'ai', number>>
  /** use the AI résumé↔JD fit score as one component */
  use_ai_match: boolean
  /** any must-have missing → fail regardless of score */
  must_have_required: boolean
}

export interface AtsJob {
  id: string
  tenant_id: string
  client_id: string | null
  title: string
  department?: string | null
  location?: string | null
  work_mode?: 'onsite' | 'hybrid' | 'remote' | null
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship' | null
  experience_min?: number | null
  experience_max?: number | null
  salary?: { min?: number; max?: number; currency?: string; period?: 'year' | 'month' | 'hour' } | null
  openings: number
  description: string
  requirements?: string | null
  skills: string[]
  status: JobStatus
  /** public apply page enabled */
  is_public: boolean
  recruiter_ids: string[]
  hiring_manager_ids: string[]
  criteria: ScreeningCriteria
  pipeline: PipelineStage[]
  /** legacy job_postings id when migrated/linked */
  legacy_job_id?: string | null
  created_by: string
  created_at: string
  updated_at: string
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export type StageType =
  | 'applied'
  | 'screening' // résumé screening by criteria
  | 'assessment' // CodeSpectra test
  | 'bot_screen' // WhatsApp chat / WhatsApp call / phone call bot
  | 'virtual_interview'
  | 'f2f_interview'
  | 'client_review'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'custom'

export type AdvanceMode = 'auto' | 'approval'

export type MeetingProvider = 'livekit' | 'zoom' | 'google_meet' | 'teams' | 'manual'
export type BotChannel = 'whatsapp_chat' | 'whatsapp_call' | 'phone_call'

export interface PipelineStage {
  id: string // stable within the job, e.g. "s_assessment"
  type: StageType
  name: string
  /** pass → next stage: automatically, or a recruiter approves the suggested move */
  advance: AdvanceMode
  /** what happens when the stage result is a fail */
  on_fail: 'reject' | 'hold' | 'review'
  /** who can act/see; clients only see stages with client_visible */
  client_visible?: boolean
  /** auto-reject candidates stuck longer than this */
  sla_days?: number | null
  notify?: { email?: boolean; whatsapp?: boolean; client?: boolean }
  config?: StageConfig
}

export type StageConfig =
  | { kind: 'screening' } // uses job.criteria
  | { kind: 'assessment'; exam_id: string | null; pass_score: number; deadline_days?: number }
  | {
      kind: 'bot_screen'
      channels: BotChannel[] // tried in order, e.g. ["whatsapp_call","phone_call","whatsapp_chat"]
      questions: { id: string; text: string; type: 'open' | 'yes_no' | 'number' | 'choice'; options?: string[]; knockout?: { equals?: unknown; min?: number; max?: number } }[]
      language?: string // e.g. "en-IN", "hi-IN"
      pass_score: number
      max_attempts?: number
    }
  | {
      kind: 'interview'
      mode: 'virtual' | 'f2f'
      provider?: MeetingProvider // virtual only
      duration_min: number
      panel_ids: string[] // default interviewers (ats member user ids)
      scorecard: ScorecardTemplate
      location?: string | null // f2f
      self_schedule?: boolean // candidate picks a slot
      pass_rule: 'all_yes' | 'majority_yes' | 'avg_score'
      pass_score?: number // for avg_score (1–5)
    }
  | { kind: 'client_review' }
  | { kind: 'offer'; template?: string | null }
  | { kind: 'custom' }

export interface ScorecardTemplate {
  criteria: { id: string; label: string; description?: string }[] // rated 1–5
}

// Default pipeline (core): applied → screening → assessment → bot_screen →
//   virtual_interview → f2f_interview → client_review → offer → hired (+ rejected).

// ─── Candidates & applications ──────────────────────────────────────────────

export type CandidateSource = 'apply_page' | 'bulk_upload' | 'manual' | 'csv' | 'talent_pool' | 'referral' | 'copilot'

export interface ParsedResume {
  name?: string
  email?: string
  phone?: string
  location?: string
  total_years?: number | null
  skills: string[]
  titles: string[]
  companies: string[]
  education: { degree?: string; field?: string; institution?: string; year?: number }[]
  notice_days?: number | null
  current_salary?: number | null
  expected_salary?: number | null
  summary?: string
  parser: 'ai' | 'heuristic'
}

export interface AtsCandidate {
  id: string
  tenant_id: string
  name: string
  email: string | null // lowercased; unique per tenant when present
  phone: string | null // E.164
  country?: string | null // ISO-2, drives region number choice
  user_id?: string | null // linked CodeSpectra account
  resume?: { file_name: string; storage_url?: string | null; text: string; uploaded_at: string } | null
  parsed?: ParsedResume | null
  tags: string[]
  source: CandidateSource
  consent?: { whatsapp?: boolean; calls?: boolean; at?: string }
  created_at: string
  updated_at: string
}

export type ApplicationStatus = 'active' | 'on_hold' | 'hired' | 'rejected' | 'withdrawn'

export interface StageResult {
  stage_id: string
  outcome: 'pass' | 'fail' | 'pending' | 'skipped'
  score?: number | null // 0–100 normalised
  summary?: string
  ref?: { kind: 'exam_submission' | 'screening_call' | 'interview'; id: string }
  at: string
}

export interface StageHistoryEntry {
  from: string | null
  to: string
  at: string
  by: string // user id or "system"
  auto: boolean
  reason?: string
}

export interface AtsApplication {
  id: string
  tenant_id: string
  job_id: string
  candidate_id: string
  client_id: string | null
  stage_id: string
  stage_entered_at: string
  status: ApplicationStatus
  match?: { score: number; breakdown: Record<string, number>; missing_must: string[]; reasons: string[] } | null
  results: StageResult[]
  history: StageHistoryEntry[]
  /** approval mode: the suggested move waiting for a recruiter */
  pending_move?: { to: string; reason: string; suggested_at: string } | null
  source: CandidateSource
  rejection_reason?: string | null
  created_at: string
  updated_at: string
}

// ─── Engine (lib/ats/engine.ts, owned by core) ──────────────────────────────
//   export async function moveApplication(actor: AtsActor | 'system', appId: string, toStageId: string, opts?: { reason?: string; auto?: boolean }): Promise<AtsApplication>
//   export async function recordStageResult(appId: string, result: StageResult): Promise<AtsApplication>
//        → applies pass/fail: pass + advance=auto → moveApplication(next); pass + approval → pending_move;
//          fail → on_fail (reject | hold | review → pending_move to rejected)
//   export async function approvePendingMove(actor, appId, accept: boolean): Promise<AtsApplication>
//   export function nextStage(job: AtsJob, stageId: string): PipelineStage | null
//
// Stage handlers let other parts plug in without touching the engine:
export interface StageHandler {
  type: StageType
  /** Called once per stage entry (idempotent key = `${app.id}:${stage.id}:${app.stage_entered_at}`). */
  onEnter?(ctx: StageHandlerContext): Promise<void>
}
export interface StageHandlerContext {
  app: AtsApplication
  job: AtsJob
  candidate: AtsCandidate
  stage: PipelineStage
  idempotencyKey: string
}
// lib/ats/handlers.ts:  export function registerStageHandler(h: StageHandler): void
//                       export function getStageHandler(type: StageType): StageHandler | undefined
// Handlers are registered by side-effect imports in lib/ats/handlers/index.ts:
//   screening + assessment (core), bot_screen (screening part), virtual/f2f (interviews part).
// When a handler's work finishes (test submitted, call scored, panel scorecards in),
// it calls recordStageResult(appId, …).

// ─── Interviews (lib/ats/interviews) ────────────────────────────────────────

export interface AtsInterview {
  id: string
  tenant_id: string
  application_id: string
  job_id: string
  candidate_id: string
  stage_id: string
  mode: 'virtual' | 'f2f'
  provider?: MeetingProvider
  join_url?: string | null
  meeting_id?: string | null
  location?: string | null
  panel: { user_id: string; email: string; name?: string }[]
  scheduled_at: string | null
  duration_min: number
  timezone?: string
  status: 'awaiting_schedule' | 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  scorecards: {
    interviewer_id: string
    ratings: Record<string, number> // criterion id → 1–5
    recommendation: 'strong_yes' | 'yes' | 'no' | 'strong_no'
    notes?: string
    submitted_at: string
  }[]
  created_at: string
  updated_at: string
}

// ─── Bot screening (lib/ats/screening) ──────────────────────────────────────

export interface ScreeningCall {
  id: string
  tenant_id: string
  application_id: string
  stage_id: string
  channel: BotChannel
  provider: string // e.g. "meta_whatsapp", "vapi", "exotel", "twilio", "simulated"
  to: string // E.164
  from?: string | null // region number used
  status: 'queued' | 'permission_requested' | 'ringing' | 'in_progress' | 'completed' | 'no_answer' | 'failed' | 'cancelled'
  attempt: number
  transcript: { role: 'bot' | 'candidate'; text: string; at: string }[]
  answers: Record<string, unknown> // question id → extracted answer
  score?: number | null // 0–100
  summary?: string | null
  recording_url?: string | null
  provider_ref?: string | null
  created_at: string
  updated_at: string
}

// ─── API (owned by core unless noted; all under /api/ats) ───────────────────
//  jobs:          GET/POST /api/ats/jobs, GET/PATCH/DELETE /api/ats/jobs/[id]
//                 GET /api/ats/jobs/[id]/board  → { job, stages:[{stage, applications:[app+candidate summary]}] }
//                 POST /api/ats/jobs/[id]/candidates  (manual add | CSV text | talent-pool ids)
//                 POST /api/ats/jobs/[id]/resumes      (multipart bulk résumé upload, PDF/DOCX/TXT/MD)
//                 POST /api/ats/jobs/[id]/rescreen
//                 GET  /api/ats/jobs/[id]/talent-pool  (suggested matches)
//  public:        GET /api/ats/public/jobs, GET /api/ats/public/jobs/[id], POST /api/ats/public/jobs/[id]/apply
//  applications:  GET /api/ats/applications/[id] (+candidate, results, history, interviews, calls)
//                 POST /api/ats/applications/[id]/move   { to, reason }
//                 POST /api/ats/applications/[id]/approve { accept }
//                 POST /api/ats/applications/[id]/status  { status, reason }
//                 GET  /api/ats/approvals  (pending moves for the actor)
//  candidates:    GET /api/ats/candidates?q=, GET/PATCH /api/ats/candidates/[id]
//  clients:       GET/POST /api/ats/clients, PATCH/DELETE /api/ats/clients/[id]
//  analytics:     GET /api/ats/analytics?job_id=  (funnel per stage, conversion, time in stage, time-to-hire, source mix)
//  team (access): GET/POST /api/ats/team, PATCH/DELETE /api/ats/team/[id], POST /api/ats/team/accept
//  interviews:    GET /api/ats/interviews (mine / by application), POST /api/ats/interviews,
//                 PATCH /api/ats/interviews/[id] (schedule/reschedule/cancel/complete),
//                 POST /api/ats/interviews/[id]/scorecard, GET /api/ats/interviews/slots?app=, POST /api/ats/interviews/self-schedule (token)
//                 GET/POST /api/ats/integrations/meetings (connect Zoom / Google / Microsoft per tenant)
//  screening:     POST /api/ats/screening/start {application_id}, GET /api/ats/screening/[id],
//                 webhooks: /api/ats/screening/webhooks/{whatsapp,vapi,exotel,twilio}
