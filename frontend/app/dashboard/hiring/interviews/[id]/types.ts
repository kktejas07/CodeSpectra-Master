import type { AtsInterview, MeetingProvider, ParsedResume, ScorecardTemplate } from '@/lib/ats/contract'

export type Scorecard = AtsInterview['scorecards'][number] & { interviewer_name?: string }

export interface InterviewDetail {
  interview: Omit<AtsInterview, 'scorecards'> & {
    scorecards: Scorecard[]
    scorecard_template: ScorecardTemplate
    pass_rule: 'all_yes' | 'majority_yes' | 'avg_score'
    pass_score?: number | null
    self_schedule?: boolean
    host_url?: string | null
    location_details?: { address: string; room?: string | null; map_url?: string | null; instructions?: string | null } | null
    requested_slot?: string | null
    scorecard_deadline_at?: string | null
    result_recorded?: boolean
    ai_summary?: string | null
    candidate_name?: string
    job_title?: string
    stage_name?: string
    last_error?: string | null
  }
  candidate: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    parsed?: ParsedResume | null
    resume?: { file_name: string; text: string; uploaded_at: string } | null
    tags?: string[]
  } | null
  application: {
    id: string
    stage_id: string
    status: string
    match: { score: number; reasons: string[] } | null
    results: { stage_id: string; outcome: string; score: number | null; summary: string | null; at: string }[]
  } | null
  job: { id: string; title: string; stages: { id: string; name: string; type: string }[] } | null
  self_schedule_link: string | null
  me: { user_id: string; role: string; on_panel: boolean; can_schedule: boolean; can_score: boolean; sees_all_scorecards: boolean }
}

export interface IntegrationsInfo {
  providers: { provider: Exclude<MeetingProvider, 'livekit' | 'manual'>; status: 'connected' | 'error' | 'disconnected'; account_label: string | null; last_error: string | null }[]
  livekit_configured: boolean
  settings: { timezone: string; default_provider: MeetingProvider | null }
}

export const REC_LABELS: Record<Scorecard['recommendation'], string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  no: 'No',
  strong_no: 'Strong no',
}
