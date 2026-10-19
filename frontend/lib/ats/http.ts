/**
 * Route helpers for /api/ats/** (core part): error mapping and loading a job /
 * application with the actor's access rules applied. Server only.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import type { AtsActor, AtsApplication, AtsJob } from './contract'
import { atsApplications, atsJobs } from './db'
import { AtsError } from './engine'
import { FileRejected } from './files'
import {
  canEditJob, canSeeApplication, canSeeJob, getAccessSettings, isAssignedInterviewer, requireAts, tenantFromRequest,
  type AtsAction, can,
} from './access'
import type { AtsRole } from './contract'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function errorResponse(e: unknown, label: string) {
  if (e instanceof AtsError || e instanceof FileRejected) return json({ error: e.message }, e.status)
  console.error(`[ats] ${label}:`, e)
  return json({ error: 'Something went wrong. Try again.' }, 500)
}

type Gate = { actor: AtsActor } | { res: NextResponse }

/** requireAts + a role-level action check. */
export async function gate(req: Request, action: AtsAction, roles: AtsRole[] = []): Promise<Gate> {
  const g = await requireAts(roles, tenantFromRequest(req))
  if ('error' in g) return { res: json({ error: g.error }, g.status) }
  if (!can(g.actor, action, { settings: await getAccessSettings(g.actor.tenantId) })) {
    return { res: json({ error: "Your hiring role can't do this" }, 403) }
  }
  return { actor: g.actor }
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

export function idOk(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
}

/** The job if the actor may see (or edit) it; 404 otherwise (no existence leak). */
export async function loadJob(actor: AtsActor, id: string, mode: 'view' | 'edit' = 'view'): Promise<AtsJob> {
  if (!idOk(id)) throw new AtsError(404, 'Job not found')
  const job = (await (await atsJobs()).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
  if (!job) throw new AtsError(404, 'Job not found')
  const settings = await getAccessSettings(actor.tenantId)
  if (!canSeeJob(actor, job, { settings })) throw new AtsError(404, 'Job not found')
  if (mode === 'edit' && !canEditJob(actor, job, { settings })) throw new AtsError(403, "You can't edit this job")
  return job
}

/** The application + job if the actor may see it. */
export async function loadApplication(actor: AtsActor, id: string): Promise<{ app: AtsApplication; job: AtsJob }> {
  if (!idOk(id)) throw new AtsError(404, 'Application not found')
  const app = (await (await atsApplications()).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsApplication | null
  if (!app) throw new AtsError(404, 'Application not found')
  const job = (await (await atsJobs()).findOne({ id: app.job_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
  if (!job) throw new AtsError(404, 'Application not found')
  const settings = await getAccessSettings(actor.tenantId)
  const interviewerAssigned = actor.role === 'interviewer' ? await isAssignedInterviewer(actor, app.id) : false
  if (!canSeeApplication(actor, app, job, { settings, interviewerAssigned })) throw new AtsError(404, 'Application not found')
  return { app, job }
}

/** Mongo filter for the jobs an actor can list. */
export async function jobScopeFilter(actor: AtsActor): Promise<Record<string, unknown> | null> {
  const base = { tenant_id: actor.tenantId }
  switch (actor.role) {
    case 'admin': return base
    case 'recruiter': {
      const s = await getAccessSettings(actor.tenantId)
      return s.recruiters_see_all_jobs ? base : { ...base, recruiter_ids: actor.userId }
    }
    case 'hiring_manager': return { ...base, hiring_manager_ids: actor.userId }
    case 'client': return actor.clientId ? { ...base, client_id: actor.clientId, status: { $ne: 'draft' } } : null
    default: return null
  }
}

/**
 * Job ids an actor is limited to, or null when they see every job of the
 * tenant (admin; recruiters while `recruiters_see_all_jobs` is on).
 */
export async function scopedJobIds(actor: AtsActor): Promise<string[] | null> {
  const scope = await jobScopeFilter(actor)
  if (!scope) return []
  if (Object.keys(scope).length === 1) return null // tenant only
  const rows = await (await atsJobs()).find(scope, { projection: { _id: 0, id: 1 } }).limit(5000).toArray()
  return rows.map((j) => String(j.id))
}

/** Candidate ids with an application on one of these jobs. */
export async function candidateIdsForJobs(tenantId: string, jobIds: string[]): Promise<string[]> {
  if (!jobIds.length) return []
  const rows = await (await atsApplications()).find({ tenant_id: tenantId, job_id: { $in: jobIds } }, { projection: { _id: 0, candidate_id: 1 } }).limit(50_000).toArray()
  return [...new Set(rows.map((a) => String(a.candidate_id)))]
}
