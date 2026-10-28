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
  | 'hr_round' // compensation confirmation + HR decision (see ADDITIONS below)
  | 'bgv' // background verification (see ADDITIONS below)

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
  | HrRoundConfig
  | BgvConfig

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
  /** latest figures (see Compensation in ADDITIONS); staff only */
  compensation?: Compensation | null
  compensation_history?: Compensation[]
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

// ─── ADDITIONS (access part) ────────────────────────────────────────────────
// Comment-only; no exported types changed. Pure rules + matrix: lib/ats/access-rules.ts
// (re-exported by lib/ats/access.ts). Extra exports there: can(actor, action, ctx),
// canSeeJob, canEditJob, candidateViewFor (redaction), clientApplicationFilter,
// clientVisibleStageIds, isAssignedInterviewer(actor, appId), tenantFromRequest(req),
// getAccessSettings(tenantId) → { recruiters_see_all_jobs (default true), client_sees_contacts (default false) }.
// canSeeApplication(actor, app, job, ctx?) takes an optional 4th arg
//   { settings?, interviewerAssigned? } — interviewers see an application only when the
//   caller passes interviewerAssigned: true (see isAssignedInterviewer).
// Collections: ats_members, ats_comments, ats_access_settings.
// API (access):  GET /api/ats/me (memberships + current), POST /api/ats/me { tenant } (switch, cookie ats_tenant)
//                GET/PATCH /api/ats/team/settings, GET /api/ats/team/accept?token=
//                GET/POST /api/ats/applications/[id]/comments { body, visibility: internal|client }
//                GET /api/ats/client/jobs, GET /api/ats/client/jobs/[id]  (client portal)
// Every /api/ats route accepts ?tenant=<id> for multi-tenant members.
// Invite landing page: /hiring-invite/[token] (public, outside /dashboard).

// ─── ADDITIONS (interviews part) ────────────────────────────────────────────
// Comment-only; no exported types changed.
// Interview stage config (kind 'interview') may carry `fallback_to_livekit?: boolean`
//   (virtual only): when the chosen provider isn't connected, book on built-in video
//   instead of asking the recruiter. Read via interviewConfig() in lib/ats/interviews/service.ts
//   (core's sanitizePipeline must keep it to be persisted).
// AtsInterview.join_url = the team's meeting link (LiveKit: the panel room page);
//   candidates get their own signed link (/interview/join/[token]) — send interviews to
//   the browser through publicInterview() (lib/ats/interviews/db.ts), which strips
//   token_nonce / sent / entry_key bookkeeping.
// Collections: ats_interviews, ats_meeting_integrations (encrypted creds), ats_interview_settings.
// API (interviews): GET/PATCH /api/ats/interviews/[id], POST /api/ats/interviews/[id]/live/token,
//   GET/POST /api/ats/interviews/join (public token), GET /api/ats/interviews/self-schedule?token=,
//   OAuth callbacks GET /api/ats/integrations/meetings/{google,microsoft}/callback.
// Pages: /interview/schedule/[token], /interview/join/[token] (public),
//   /dashboard/hiring/interviews[/[id][/live]], /dashboard/hiring/settings/integrations.

// ─── ADDITIONS (HR round + background verification) ─────────────────────────
//
// Owner decisions (2026-10-19):
//  - Compensation is collected AT APPLY TIME: experienced candidates give their
//    current/last CTC (and expected); freshers give expected CTC only.
//  - A new 'hr_round' stage: the candidate confirms compensation through a secure
//    link (experienced → current/last drawn + breakup + expected + notice;
//    fresher → expected), HR records the round outcome; pass/fail → engine.
//  - A new 'bgv' stage after HR: region-based background verification, India and
//    USA first. Candidate submits data + documents through a secure portal;
//    verifiers mark each check; overall result → engine. Vendor adapters optional.

/** Stage types added after the first release. STAGE_TYPES in lib/ats/pipeline.ts includes them. */
export type StageTypeAddition = 'hr_round' | 'bgv'

export type ExperienceLevel = 'fresher' | 'experienced'

export interface Compensation {
  experience_level: ExperienceLevel
  currency: string // ISO 4217, e.g. INR, USD
  period: 'year' | 'month' | 'hour'
  /** experienced only: current CTC, or last drawn if not currently employed */
  current_ctc?: number | null
  currently_employed?: boolean | null
  breakup?: { fixed?: number | null; variable?: number | null; other?: number | null } | null
  expected_ctc?: number | null // required for freshers; optional for experienced
  notice_days?: number | null
  negotiable?: boolean | null
  /** where the figures came from */
  source: 'apply' | 'hr_form' | 'recruiter'
  confirmed_at?: string | null
}
// Stored on AtsApplication as `compensation?: Compensation | null` (latest) and
// `compensation_history?: Compensation[]`. Visible to admin/recruiter/hiring_manager
// only (never interviewer/client), same as salary today.

export interface HrRoundConfig {
  kind: 'hr_round'
  /** send the candidate the compensation confirmation form on stage entry */
  collect_compensation: boolean
  /** optional HR conversation scheduled through the interviews part */
  interview?: { mode: 'virtual' | 'f2f'; provider?: MeetingProvider; duration_min: number; panel_ids: string[] } | null
  /** form must be submitted within N days (reminders at half-way) */
  form_deadline_days?: number
}

export type BgvRegion = 'IN' | 'US'

export type BgvCheckType =
  // shared
  | 'identity' | 'address' | 'education' | 'employment' | 'reference' | 'criminal'
  // India
  | 'pan' | 'aadhaar' | 'uan_epfo' | 'court_record'
  // USA
  | 'ssn_trace' | 'county_criminal' | 'federal_criminal' | 'national_criminal' | 'sex_offender' | 'mvr' | 'drug_test'

export interface BgvConfig {
  kind: 'bgv'
  /** 'auto' = from candidate.country / job location; else fixed */
  region: BgvRegion | 'auto'
  checks: BgvCheckType[]
  /** employment history depth */
  employment_years?: number // default 7 (US) / all (IN, last 2 employers mandatory)
  address_years?: number // default 7 (US) / current + permanent (IN)
  references_count?: number
  /** vendor adapter id or 'manual' */
  vendor: 'manual' | 'checkr' | 'simulated' | string
  form_deadline_days?: number
  /** discrepancy handling: any 'discrepancy' on these checks fails the stage */
  critical_checks?: BgvCheckType[]
}
// Implemented in lib/ats/bgv/** (BGV part): case model `ats_bgv_cases`, candidate
// portal (signed token), document storage (virus-scanned, encrypted sensitive
// fields: PAN, Aadhaar (masked, last 4 only + document), SSN), verifier workflow,
// consent/disclosure (DPDP Act India; FCRA disclosure + authorization and
// pre-adverse / adverse action notices US), retention purge, audit on every view.
// UI component exported from components/hiring/bgv/index.ts: <BgvPanel applicationId />.
//
// Implemented (HR round part): pure rules lib/ats/compensation.ts (parseCompensation,
// currency/period defaults, formatting) and lib/ats/hr/rules.ts; service + handler
// lib/ats/hr/{service,handler,db}.ts, collection `ats_hr_forms` (one per stage entry).
// Pipeline rules for hr_round / bgv (BGV_CHECKS_BY_REGION, DEFAULT_BGV_CHECKS,
// bgvChecksFor, pipelineWarnings) live in lib/ats/pipeline.ts.
// An HR conversation is an AtsInterview on the hr_round stage (entry key suffix
// ':hr_interview'); the engine records its panel verdict as 'pending' advice — the HR
// decision decides. API: GET/POST /api/ats/hr-form (public token),
// POST /api/ats/applications/[id]/hr-decision, GET/POST …/hr-round (status / resend),
// PATCH …/compensation. Page: /hr-form/[token] (public).
