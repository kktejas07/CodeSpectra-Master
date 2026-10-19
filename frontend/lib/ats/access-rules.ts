/**
 * ATS access rules — pure and client-safe (unit tested in tests/ats-access.test.ts).
 * Server wiring (session → actor, Mongo) lives in lib/ats/access.ts, which
 * re-exports everything here.
 *
 * ┌──────────────────────────┬───────┬───────────┬────────────────┬─────────────┬────────┐
 * │ action                   │ admin │ recruiter │ hiring_manager │ interviewer │ client │
 * ├──────────────────────────┼───────┼───────────┼────────────────┼─────────────┼────────┤
 * │ job.view                 │ all   │ scoped¹   │ their jobs²    │ –⁴          │ own³   │
 * │ job.create / job.edit    │ ✓     │ ✓ (scoped)│ –              │ –           │ –      │
 * │ application.view         │ all   │ scoped¹   │ their jobs²    │ assigned⁴   │ vis.⁵  │
 * │ application.move/status  │ ✓     │ ✓         │ –              │ –           │ –      │
 * │ application.approve      │ ✓     │ ✓         │ ✓              │ –           │ ✓⁶     │
 * │ candidate.add (intake)   │ ✓     │ ✓         │ –              │ –           │ –      │
 * │ candidate.contact        │ ✓     │ ✓         │ ✓              │ –           │ set.⁷  │
 * │ candidate.salary         │ ✓     │ ✓         │ ✓              │ –           │ –      │
 * │ interview.schedule       │ ✓     │ ✓         │ –              │ –           │ –      │
 * │ interview.view           │ ✓     │ ✓         │ ✓              │ assigned⁴   │ –      │
 * │ scorecard.submit         │ ✓     │ ✓         │ ✓              │ assigned⁴   │ –      │
 * │ comment.internal         │ ✓     │ ✓         │ ✓              │ –           │ –      │
 * │ comment.client           │ ✓     │ ✓         │ –              │ –           │ ✓      │
 * │ analytics.view           │ ✓     │ ✓         │ –              │ –           │ –      │
 * │ clients.view             │ ✓     │ ✓         │ –              │ –           │ –      │
 * │ clients.manage           │ ✓     │ –         │ –              │ –           │ –      │
 * │ team.view                │ ✓     │ ✓         │ ✓              │ –           │ –      │
 * │ team.manage / settings   │ ✓     │ –         │ –              │ –           │ –      │
 * └──────────────────────────┴───────┴───────────┴────────────────┴─────────────┴────────┘
 * ¹ jobs whose recruiter_ids include them, or every job when the tenant setting
 *   `recruiters_see_all_jobs` is on (default on).
 * ² jobs whose hiring_manager_ids include them.
 * ³ jobs whose client_id is their client.
 * ⁴ only applications with an interview that has them on the panel (caller passes
 *   `interviewerAssigned`); they see the candidate's name + résumé, no contact/salary.
 * ⁵ only their client's applications at stages with client_visible (or hired).
 * ⁶ canActOnStage: clients act only in client_review; interviewers only in interview stages.
 * ⁷ only when the tenant setting `client_sees_contacts` is on (default off).
 * Every check also requires actor.tenantId === record.tenant_id.
 * tenant_admin of the tenant and superadmin (explicit tenant) resolve to admin.
 */
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob, AtsRole, PipelineStage } from '@/lib/ats/contract'

export const ATS_ROLES: readonly AtsRole[] = ['admin', 'recruiter', 'hiring_manager', 'interviewer', 'client']

export type AtsAction =
  | 'job.view' | 'job.create' | 'job.edit'
  | 'application.view' | 'application.move' | 'application.status' | 'application.approve'
  | 'candidate.add' | 'candidate.contact' | 'candidate.salary'
  | 'interview.schedule' | 'interview.view' | 'scorecard.submit'
  | 'comment.internal' | 'comment.client'
  | 'analytics.view' | 'clients.view' | 'clients.manage'
  | 'team.view' | 'team.manage' | 'settings.manage'

export const ATS_ACTIONS: readonly AtsAction[] = [
  'job.view', 'job.create', 'job.edit',
  'application.view', 'application.move', 'application.status', 'application.approve',
  'candidate.add', 'candidate.contact', 'candidate.salary',
  'interview.schedule', 'interview.view', 'scorecard.submit',
  'comment.internal', 'comment.client',
  'analytics.view', 'clients.view', 'clients.manage',
  'team.view', 'team.manage', 'settings.manage',
]

const RECRUITER: AtsAction[] = [
  'job.view', 'job.create', 'job.edit',
  'application.view', 'application.move', 'application.status', 'application.approve',
  'candidate.add', 'candidate.contact', 'candidate.salary',
  'interview.schedule', 'interview.view', 'scorecard.submit',
  'comment.internal', 'comment.client', 'analytics.view', 'clients.view', 'team.view',
]

/** Role → actions (before record scoping). See the table above. */
export const ATS_PERMISSIONS: Readonly<Record<AtsRole, ReadonlySet<AtsAction>>> = {
  admin: new Set(ATS_ACTIONS),
  recruiter: new Set(RECRUITER),
  hiring_manager: new Set<AtsAction>([
    'job.view', 'application.view', 'application.approve', 'candidate.contact', 'candidate.salary',
    'interview.view', 'scorecard.submit', 'comment.internal', 'team.view',
  ]),
  interviewer: new Set<AtsAction>(['application.view', 'interview.view', 'scorecard.submit']),
  client: new Set<AtsAction>(['job.view', 'application.view', 'application.approve', 'comment.client', 'candidate.contact']),
}

/** Per-tenant access switches (stored in `ats_access_settings`, see lib/ats/access.ts). */
export interface AtsAccessSettings {
  recruiters_see_all_jobs: boolean
  client_sees_contacts: boolean
}
export const DEFAULT_ACCESS_SETTINGS: AtsAccessSettings = { recruiters_see_all_jobs: true, client_sees_contacts: false }

export interface AccessContext {
  settings?: Partial<AtsAccessSettings> | null
  /** The caller has checked that an interview of this application has the actor on its panel. */
  interviewerAssigned?: boolean
}

function settingsOf(ctx?: AccessContext): AtsAccessSettings {
  return { ...DEFAULT_ACCESS_SETTINGS, ...(ctx?.settings || {}) }
}

/** Role-level permission (no record scoping). */
export function can(actor: Pick<AtsActor, 'role'>, action: AtsAction, ctx?: AccessContext): boolean {
  if (!ATS_PERMISSIONS[actor.role]?.has(action)) return false
  if (actor.role === 'client' && action === 'candidate.contact') return settingsOf(ctx).client_sees_contacts
  return true
}

type JobScopeFields = Pick<AtsJob, 'tenant_id' | 'client_id' | 'recruiter_ids' | 'hiring_manager_ids'> & { status?: AtsJob['status'] }

/** Can the actor see this job at all? (Clients never see drafts.) */
export function canSeeJob(actor: AtsActor, job: JobScopeFields, ctx?: AccessContext): boolean {
  if (!actor.tenantId || job.tenant_id !== actor.tenantId) return false
  switch (actor.role) {
    case 'admin': return true
    case 'recruiter': return settingsOf(ctx).recruiters_see_all_jobs || (job.recruiter_ids || []).includes(actor.userId)
    case 'hiring_manager': return (job.hiring_manager_ids || []).includes(actor.userId)
    case 'interviewer': return ctx?.interviewerAssigned === true
    case 'client': return !!actor.clientId && job.client_id === actor.clientId && job.status !== 'draft'
    default: return false
  }
}

/** Can the actor edit this job (create is `can(actor, 'job.create')`)? */
export function canEditJob(actor: AtsActor, job: JobScopeFields, ctx?: AccessContext): boolean {
  return can(actor, 'job.edit') && canSeeJob(actor, job, ctx)
}

/** Stage ids a client may see on this job (client_visible stages + hired). */
export function clientVisibleStageIds(job: Pick<AtsJob, 'pipeline'>): string[] {
  return (job.pipeline || []).filter((s) => s.client_visible || s.type === 'hired').map((s) => s.id)
}

export function isClientVisible(app: Pick<AtsApplication, 'stage_id' | 'status'>, job: Pick<AtsJob, 'pipeline'>): boolean {
  return app.status === 'hired' || clientVisibleStageIds(job).includes(app.stage_id)
}

/**
 * Can the actor see this application? Clients: own client's job + client-visible
 * stage; interviewers: only with `ctx.interviewerAssigned`; others: job scope.
 */
export function canSeeApplication(actor: AtsActor, app: AtsApplication, job: AtsJob, ctx?: AccessContext): boolean {
  if (!actor.tenantId || app.tenant_id !== actor.tenantId || job.tenant_id !== actor.tenantId || app.job_id !== job.id) return false
  if (actor.role === 'interviewer') return ctx?.interviewerAssigned === true
  if (!canSeeJob(actor, job, ctx)) return false
  if (actor.role === 'client') {
    if ((app.client_id ?? job.client_id) !== actor.clientId) return false
    return isClientVisible(app, job)
  }
  return true
}

/**
 * Can the actor act (approve / record a result) on an application in this
 * stage? Callers must also check canSeeApplication for the record.
 */
export function canActOnStage(actor: AtsActor, stage: PipelineStage): boolean {
  switch (actor.role) {
    case 'admin':
    case 'recruiter':
    case 'hiring_manager':
      return true
    case 'interviewer':
      return stage.type === 'virtual_interview' || stage.type === 'f2f_interview'
    case 'client':
      return stage.type === 'client_review' && stage.client_visible !== false
    default:
      return false
  }
}

/** Mongo filter for the applications a client may list on one job. */
export function clientApplicationFilter(actor: AtsActor, job: AtsJob): Record<string, unknown> | null {
  if (actor.role !== 'client' || !canSeeJob(actor, job)) return null
  return {
    tenant_id: actor.tenantId,
    job_id: job.id,
    $or: [{ stage_id: { $in: clientVisibleStageIds(job) } }, { status: 'hired' }],
  }
}

/** Staff who see the whole application / job record (criteria, match detail, results, history). */
const FULL_RECORD_ROLES: ReadonlySet<AtsRole> = new Set(['admin', 'recruiter', 'hiring_manager'])

/** Pipeline stages without their config (exam ids, bot questions, panels) for limited viewers. */
const bareStage = (s: PipelineStage): PipelineStage => ({ id: s.id, type: s.type, name: s.name, advance: s.advance, on_fail: s.on_fail, ...(s.client_visible !== undefined ? { client_visible: s.client_visible } : {}) })

/**
 * The part of a job this actor may read. Staff: everything. Interviewers and
 * clients: the role description and pipeline stage names — no screening
 * criteria, team ids or stage config; clients only see client-visible stages.
 */
export function jobViewFor(actor: Pick<AtsActor, 'role'>, job: AtsJob): AtsJob {
  if (FULL_RECORD_ROLES.has(actor.role)) return job
  const { criteria: _c, recruiter_ids: _r, hiring_manager_ids: _h, created_by: _b, legacy_job_id: _l, ...rest } = job
  const visible = actor.role === 'client' ? new Set(clientVisibleStageIds(job)) : null
  return {
    ...rest,
    pipeline: (job.pipeline || []).filter((s) => !visible || visible.has(s.id)).map(bareStage),
  } as AtsJob
}

/**
 * The part of an application this actor may read. Staff: everything.
 * Interviewers: stage, status, match score and per-stage outcome/score (no
 * match reasons, result summaries — bot screens carry salary / notice answers —
 * or move reasons). Clients: stage, status and match score only.
 */
export function applicationViewFor(actor: Pick<AtsActor, 'role'>, app: AtsApplication): AtsApplication {
  if (FULL_RECORD_ROLES.has(actor.role)) return app
  const base = {
    id: app.id,
    tenant_id: app.tenant_id,
    job_id: app.job_id,
    candidate_id: app.candidate_id,
    client_id: app.client_id,
    stage_id: app.stage_id,
    stage_entered_at: app.stage_entered_at,
    status: app.status,
    source: app.source,
    match: app.match ? { score: app.match.score, breakdown: {}, missing_must: [], reasons: [] } : null,
    pending_move: null,
    rejection_reason: null,
    created_at: app.created_at,
    updated_at: app.updated_at,
  }
  if (actor.role === 'interviewer') {
    return {
      ...base,
      results: (app.results || []).map((r) => ({ stage_id: r.stage_id, outcome: r.outcome, score: r.score ?? null, at: r.at })),
      history: (app.history || []).map((h) => ({ from: h.from, to: h.to, at: h.at, by: h.by, auto: h.auto })),
    }
  }
  return { ...base, results: [], history: [] }
}

export type CandidateView = Pick<AtsCandidate, 'id' | 'name'> & Partial<Omit<AtsCandidate, 'id' | 'name'>>

/**
 * The part of a candidate this actor may see. Interviewers get name + résumé;
 * clients get name + résumé summary (+ contact when the tenant allows it);
 * salary only with `candidate.salary`.
 */
export function candidateViewFor(actor: AtsActor, c: AtsCandidate, ctx?: AccessContext): CandidateView {
  const contact = can(actor, 'candidate.contact', ctx)
  const salary = can(actor, 'candidate.salary', ctx)
  const parsed = c.parsed
    ? (() => {
        const { email, phone, current_salary, expected_salary, ...rest } = c.parsed
        return {
          ...rest,
          ...(contact ? { email, phone } : {}),
          ...(salary ? { current_salary, expected_salary } : {}),
        }
      })()
    : null
  if (actor.role === 'interviewer') {
    return { id: c.id, name: c.name, parsed: parsed as AtsCandidate['parsed'], resume: c.resume ?? null }
  }
  if (actor.role === 'client') {
    return {
      id: c.id,
      name: c.name,
      parsed: parsed as AtsCandidate['parsed'],
      resume: c.resume ? { file_name: c.resume.file_name, text: '', uploaded_at: c.resume.uploaded_at } : null,
      ...(contact ? { email: c.email, phone: c.phone } : {}),
    }
  }
  return {
    ...c,
    parsed: parsed as AtsCandidate['parsed'],
    ...(contact ? {} : { email: null, phone: null }),
  }
}

// ─── Membership resolution ──────────────────────────────────────────────────

export interface MembershipChoice {
  tenantId: string
  role: AtsRole
  clientId: string | null
  /** ISO; most recent wins when nothing else picks */
  at: string
  /** tenant_admin of this tenant (always admin, preferred default) */
  orgAdmin?: boolean
}

/**
 * Pick the active membership. An explicit tenant (query param) must match a
 * membership (or the caller is superadmin) — otherwise null, never a silent
 * fallback. A cookie tenant is a preference only. Default: the user's own
 * organisation as tenant_admin, else the most recent membership.
 */
export function pickMembership(
  choices: MembershipChoice[],
  opts: { requested?: string | null; cookie?: string | null; superadmin?: boolean },
): MembershipChoice | null {
  const byTenant = new Map<string, MembershipChoice>()
  for (const c of choices) {
    const prev = byTenant.get(c.tenantId)
    // tenant_admin beats a stored role for the same tenant
    if (!prev || (c.orgAdmin && !prev.orgAdmin)) byTenant.set(c.tenantId, c)
  }
  if (opts.requested) {
    const hit = byTenant.get(opts.requested)
    if (hit) return hit
    if (opts.superadmin) return { tenantId: opts.requested, role: 'admin', clientId: null, at: new Date(0).toISOString() }
    return null
  }
  if (opts.cookie && byTenant.has(opts.cookie)) return byTenant.get(opts.cookie)!
  const all = [...byTenant.values()]
  if (!all.length) return null
  return all.sort((a, b) => (Number(!!b.orgAdmin) - Number(!!a.orgAdmin)) || b.at.localeCompare(a.at))[0]
}

// ─── Team input validation ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length <= 320 && EMAIL_RE.test(e) ? e : null
}

export function parseRole(v: unknown): AtsRole | null {
  return typeof v === 'string' && (ATS_ROLES as readonly string[]).includes(v) ? (v as AtsRole) : null
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export function parseId(v: unknown): string | null {
  return typeof v === 'string' && ID_RE.test(v) ? v : null
}

export type InviteInput = { email: string; role: AtsRole; name: string | null; client_id: string | null }

/** Validate an invite / role-change body. client role needs client_id; hiring_manager may carry one. */
export function parseInviteInput(body: unknown): { ok: true; value: InviteInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const email = normalizeEmail(b.email)
  if (!email) return { ok: false, error: 'Enter a valid email address' }
  const role = parseRole(b.role)
  if (!role) return { ok: false, error: 'Choose a role' }
  const rawName = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
  const clientId = b.client_id == null || b.client_id === '' ? null : parseId(b.client_id)
  if (b.client_id != null && b.client_id !== '' && !clientId) return { ok: false, error: 'Invalid client' }
  if (role === 'client' && !clientId) return { ok: false, error: 'Pick the client this person belongs to' }
  return {
    ok: true,
    value: { email, role, name: rawName || null, client_id: role === 'client' || role === 'hiring_manager' ? clientId : null },
  }
}

export const ROLE_LABELS: Record<AtsRole, string> = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
  interviewer: 'Interviewer',
  client: 'Client',
}
