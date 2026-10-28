/**
 * Who may see / run an interview. Pure (tests/ats-interviews.test.ts).
 *  - panel members always see their interviews and submit scorecards;
 *  - admin / recruiter / hiring manager see interviews of jobs they can see;
 *  - only admin / recruiter (interview.schedule) schedule, cancel, edit panels;
 *  - clients never see interviews.
 * Interviewers see other panel members' scorecards only after submitting theirs.
 */
import { can, canSeeJob } from '@/lib/ats/access-rules'
import type { AtsActor, AtsJob } from '@/lib/ats/contract'
import type { AtsInterviewDoc } from './db'

type JobScope = Pick<AtsJob, 'tenant_id' | 'client_id' | 'recruiter_ids' | 'hiring_manager_ids'>
type Iv = Pick<AtsInterviewDoc, 'tenant_id' | 'panel' | 'scorecards'>

export const onPanel = (actor: Pick<AtsActor, 'userId'>, iv: Pick<AtsInterviewDoc, 'panel'>) => iv.panel.some((p) => p.user_id === actor.userId)

export function canViewInterview(actor: AtsActor, iv: Iv, job: JobScope | null): boolean {
  if (!actor.tenantId || iv.tenant_id !== actor.tenantId) return false
  if (onPanel(actor, iv)) return true
  if (actor.role === 'interviewer' || actor.role === 'client') return false
  return !!job && can(actor, 'interview.view') && canSeeJob(actor, job)
}

export function canScheduleInterview(actor: AtsActor, iv: Pick<AtsInterviewDoc, 'tenant_id'>, job: JobScope | null): boolean {
  if (!actor.tenantId || iv.tenant_id !== actor.tenantId || !job) return false
  return can(actor, 'interview.schedule') && canSeeJob(actor, job)
}

export function canSeeAllScorecards(actor: AtsActor, iv: Iv, job: JobScope | null): boolean {
  if (actor.role === 'admin' || actor.role === 'recruiter' || actor.role === 'hiring_manager') return canViewInterview(actor, iv, job)
  return onPanel(actor, iv) && iv.scorecards.some((c) => c.interviewer_id === actor.userId)
}
