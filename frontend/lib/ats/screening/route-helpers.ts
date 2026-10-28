/** Shared bits for /api/ats/screening/** routes. */
import {
  atsCollection, canSeeApplication, getAccessSettings, isAssignedInterviewer,
} from '@/lib/ats/access'
import type { AtsActor, AtsApplication, AtsCandidate, AtsJob } from '@/lib/ats/contract'
import type { ScreeningCallDoc } from './types'

/** Application + job + candidate if the actor may see the application (else null → 404). */
export async function loadVisibleApp(actor: AtsActor, appId: string): Promise<{ app: AtsApplication; job: AtsJob; candidate: AtsCandidate } | null> {
  const app = (await (await atsCollection<AtsApplication>('applications')).findOne({ id: appId, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsApplication | null
  if (!app) return null
  const job = (await (await atsCollection<AtsJob>('jobs')).findOne({ id: app.job_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsJob | null
  const candidate = (await (await atsCollection<AtsCandidate>('candidates')).findOne({ id: app.candidate_id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as AtsCandidate | null
  if (!job || !candidate) return null
  const [settings, interviewerAssigned] = await Promise.all([
    getAccessSettings(actor.tenantId),
    actor.role === 'interviewer' ? isAssignedInterviewer(actor, appId) : Promise.resolve(false),
  ])
  return canSeeApplication(actor, app, job, { settings, interviewerAssigned }) ? { app, job, candidate } : null
}

/** Screening calls hold candidate PII (transcripts, recordings): clients never see them. */
export const SCREENING_VIEW_ROLES = ['admin', 'recruiter', 'hiring_manager', 'interviewer'] as const

/** Strip internal fields before sending a call to the browser. */
export function publicCall(c: ScreeningCallDoc) {
  const {
    _id, lock_until, test, entry_key, entry_channel, reprompts, ...rest // eslint-disable-line @typescript-eslint/no-unused-vars
  } = c as ScreeningCallDoc & { _id?: unknown; lock_until?: unknown; test?: unknown }
  return { ...rest, simulated: c.provider === 'simulated' }
}
