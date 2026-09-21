/**
 * Judge-queue client. Mirrors the web judge tab's endpoints:
 *  - event list: /api/hackathons (admins) or ?judge=1 (judges)
 *  - queue:      /api/hackathons/[id]/judge-submissions (403 if not a judge)
 *  - scoring:    PATCH /api/hackathons/[id]/submissions/[submissionId]
 *                with rubric_scores (merged per judge server-side)
 */
import { api } from './client'

export type JudgeRole = 'superadmin' | 'tenant_admin' | 'judge' | 'user'

export interface JudgingCriterion {
  key: string
  label: string
  weight: number
}

export interface JudgingConfig {
  criteria?: JudgingCriterion[]
  blindMode?: boolean
  dropHighLow?: boolean
}

export interface JudgeEvent {
  id: string
  name: string
  slug?: string
  status?: string
  starts_at?: string
  ends_at?: string
  judging_config?: JudgingConfig
}

export interface JudgeSubmission {
  id: string
  team_id?: string
  team_name?: string
  status?: string
  score?: number
  feedback?: string
  submitted_at?: string
  repo_url?: string
  live_url?: string
  video_url?: string
  comment?: string
  rubric_scores?: Array<{ judge_id?: string; total_score?: number; feedback?: string }>
}

export interface ScorePayload {
  criteria: Array<{ name: string; score: number }>
  total_score: number
  feedback: string
}

const DEFAULT_CRITERIA: JudgingCriterion[] = [
  { key: 'relevance', label: 'Problem relevance', weight: 1 },
  { key: 'innovation', label: 'Innovation & originality', weight: 1 },
  { key: 'implementation', label: 'Implementation quality', weight: 1 },
  { key: 'ai_use', label: 'Effective AI use', weight: 1 },
  { key: 'ux', label: 'User experience', weight: 1 },
  { key: 'completeness', label: 'Completeness', weight: 1 },
]

/** Criteria from the event doc, falling back to the platform defaults. */
export function criteriaFor(event: JudgeEvent | null): JudgingCriterion[] {
  const list = event?.judging_config?.criteria
  if (Array.isArray(list) && list.length > 0) return list
  return DEFAULT_CRITERIA
}

export async function listJudgeEvents(role: JudgeRole): Promise<JudgeEvent[]> {
  const isAdmin = role === 'superadmin' || role === 'tenant_admin'
  const path = isAdmin ? '/api/hackathons' : '/api/hackathons?judge=1'
  const res = await api.get<{ items?: JudgeEvent[] }>(path)
  return Array.isArray(res.items) ? res.items : []
}

export async function listJudgeSubmissions(eventId: string): Promise<JudgeSubmission[]> {
  const res = await api.get<{ data?: JudgeSubmission[] }>(
    `/api/hackathons/${encodeURIComponent(eventId)}/judge-submissions`,
  )
  return Array.isArray(res.data) ? res.data : []
}

export async function getSubmission(eventId: string, submissionId: string): Promise<JudgeSubmission> {
  return api.get<JudgeSubmission>(
    `/api/hackathons/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(submissionId)}`,
  )
}

/**
 * Submit a rubric score. `status` advances the workflow when allowed
 * (under_review → review_completed is the safe judge transition).
 */
export async function scoreSubmission(
  eventId: string,
  submissionId: string,
  payload: ScorePayload,
  status?: string,
): Promise<void> {
  const body: Record<string, unknown> = { rubric_scores: payload }
  if (status) body.status = status
  await api.patch(
    `/api/hackathons/${encodeURIComponent(eventId)}/submissions/${encodeURIComponent(submissionId)}`,
    body,
  )
}

export function statusTone(status?: string): { color: string; label: string } {
  switch (status) {
    case 'accepted':
    case 'released':
      return { color: '#22C55E', label: status }
    case 'rejected':
      return { color: '#EF4444', label: status }
    case 'review_completed':
      return { color: '#38BDF8', label: 'reviewed' }
    case 'under_review':
      return { color: '#EAB308', label: 'in review' }
    default:
      return { color: '#94A3B8', label: status || 'submitted' }
  }
}
