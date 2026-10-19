/**
 * Hiring pipeline (ATS) helpers for agent tools. The copilot acts as an ATS
 * admin of the caller's organisation (tenant admins are org admins; a
 * superadmin must pick an organisation first) and goes through the same
 * services + access rules the hiring UI uses (lib/ats/*).
 */
import { ToolInputError, ToolPermissionError, type AgentCaller } from '@/lib/agent/contract'
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'

export function atsActorFor(caller: AgentCaller): AtsActor {
  const tenantId = caller.tenantId
  if (!tenantId) {
    throw new ToolInputError('The hiring pipeline is per organisation. Pick an organisation in the copilot first (superadmin tenant picker).')
  }
  return { userId: caller.userId, tenantId, role: 'admin', clientId: null, email: (caller.email || '').toLowerCase(), ...(caller.name ? { name: caller.name } : {}) }
}

/** Run an ATS service call; AtsError → friendly tool errors. */
export async function atsCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const status = (e as { status?: unknown })?.status
    const msg = e instanceof Error ? e.message : String(e)
    if (typeof status === 'number') {
      if (status === 404) throw new ToolPermissionError(`${msg}. Check the id (use list_jobs / list_applicants).`)
      if (status === 403) throw new ToolPermissionError(msg)
      if (status >= 400 && status < 500) throw new ToolInputError(msg)
    }
    throw e
  }
}

export const jobLink = (id: string) => `/dashboard/hiring/jobs/${id}`
export const applicationLink = (jobId: string, appId: string) => `/dashboard/hiring/jobs/${jobId}?application=${appId}`

export function stageName(job: Pick<AtsJob, 'pipeline'>, stageId: string): string {
  return job.pipeline.find((s) => s.id === stageId)?.name || stageId
}

/** Resolve a stage given by id or (case-insensitive) name / type. */
export function resolveStage(job: Pick<AtsJob, 'pipeline'>, ref: string) {
  const r = ref.trim().toLowerCase()
  return job.pipeline.find((s) => s.id.toLowerCase() === r)
    ?? job.pipeline.find((s) => s.name.toLowerCase() === r)
    ?? job.pipeline.find((s) => s.type === r)
    ?? job.pipeline.find((s) => s.name.toLowerCase().includes(r))
}

export function jobSummary(j: AtsJob, counts?: Record<string, number>) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined
  return {
    id: j.id,
    title: j.title,
    status: j.status,
    location: j.location ?? null,
    work_mode: j.work_mode ?? null,
    openings: j.openings,
    skills: (j.skills || []).slice(0, 15),
    public: j.is_public,
    ...(total !== undefined ? { applicants: total } : {}),
    created_at: j.created_at,
    link: jobLink(j.id),
  }
}

/** Applicant row for the model: staff view, PII-minimised (no phone, no salary, no résumé text). */
export function applicantRow(app: AtsApplication, job: Pick<AtsJob, 'pipeline'>, cand: Pick<AtsCandidate, 'name' | 'email' | 'parsed' | 'tags'> | null) {
  return {
    application_id: app.id,
    candidate: cand?.name || 'Unknown',
    email: cand?.email ?? null,
    stage: stageName(job, app.stage_id),
    stage_id: app.stage_id,
    status: app.status,
    match: app.match ? { score: Math.round(app.match.score), missing_must: (app.match.missing_must || []).slice(0, 5), reasons: (app.match.reasons || []).slice(0, 3) } : null,
    years: cand?.parsed?.total_years ?? null,
    top_skills: (cand?.parsed?.skills || []).slice(0, 8),
    tags: (cand?.tags || []).slice(0, 6),
    pending_move: app.pending_move ? { to: stageName(job, app.pending_move.to), reason: app.pending_move.reason } : null,
    applied_at: app.created_at,
  }
}
