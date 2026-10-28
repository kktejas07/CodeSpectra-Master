/**
 * Interview collections. `ats_interviews` rows are the contract's AtsInterview
 * plus server-only bookkeeping (never sent to the browser as-is; see
 * `publicInterview`).
 */
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { AtsInterview, MeetingProvider, ScorecardTemplate } from '@/lib/ats/contract'

export { newId, nowIso } from '@/lib/db/ids'

export interface F2fLocation {
  address: string
  room?: string | null
  map_url?: string | null
  instructions?: string | null
}

export interface AtsInterviewDoc extends AtsInterview {
  /** `${app.id}:${stage.id}:${app.stage_entered_at}` — one interview per stage entry */
  entry_key?: string | null
  /** stage snapshot so later job edits don't change a running round */
  scorecard_template: ScorecardTemplate
  pass_rule: 'all_yes' | 'majority_yes' | 'avg_score'
  pass_score?: number | null
  self_schedule?: boolean
  fallback_to_livekit?: boolean
  location_details?: F2fLocation | null
  /** provider host link (Zoom start_url, LiveKit panel room) — panel/recruiters only */
  host_url?: string | null
  /** connected-account owner of an external meeting (to update/cancel it) */
  provider_account?: string | null
  /** candidate links (join + self-schedule) are signed with this; rotated on change */
  token_nonce: string
  /** a self-schedule choice that could not be booked automatically */
  requested_slot?: string | null
  scorecard_deadline_at?: string | null
  /** last time it was booked or moved */
  booked_at?: string | null
  /** idempotency ledger for side effects (invites, reminders, results) */
  sent: string[]
  result_recorded?: boolean
  ai_summary?: string | null
  candidate_name?: string
  candidate_email?: string | null
  job_title?: string
  stage_name?: string
  last_error?: string | null
  /** how the self-schedule invite reached the candidate (CORE-053) */
  invite_delivery?: { email: 'sent' | 'unsubscribed' | 'failed' | 'no_email'; whatsapp: boolean; at: string } | null
  created_by: string
}

export type ConnectableProvider = Exclude<MeetingProvider, 'livekit' | 'manual'>
export const CONNECTABLE: readonly ConnectableProvider[] = ['zoom', 'google_meet', 'teams']

export interface MeetingIntegrationDoc {
  tenant_id: string
  provider: ConnectableProvider
  status: 'connected' | 'error'
  /** shown in the UI: account email / Zoom account id */
  account_label?: string | null
  /** AES-GCM box of the credentials JSON (lib/ats/interviews/tokens.ts) */
  secret: string
  connected_by: string
  connected_at: string
  updated_at: string
  last_error?: string | null
}

export interface InterviewSettingsDoc {
  tenant_id: string
  timezone?: string | null
  work_start_hour?: number
  work_end_hour?: number
  default_provider?: MeetingProvider | null
  updated_at: string
  updated_by: string
}

let ready: Promise<unknown> | null = null

async function ensure(): Promise<void> {
  const db = await getMongoDb()
  ready ??= Promise.all([
    db.collection('ats_interviews').createIndex({ id: 1 }, { unique: true, name: 'ats_interviews_id' }),
    db.collection('ats_interviews').createIndex(
      { entry_key: 1 },
      { unique: true, name: 'ats_interviews_entry', partialFilterExpression: { entry_key: { $type: 'string' } } },
    ),
    db.collection('ats_interviews').createIndex({ tenant_id: 1, application_id: 1 }, { name: 'ats_interviews_tenant_app' }),
    db.collection('ats_interviews').createIndex({ 'panel.user_id': 1, scheduled_at: 1 }, { name: 'ats_interviews_panel' }),
    db.collection('ats_interviews').createIndex({ status: 1, scheduled_at: 1 }, { name: 'ats_interviews_status_time' }),
    db.collection('ats_meeting_integrations').createIndex({ tenant_id: 1, provider: 1 }, { unique: true, name: 'ats_meeting_tenant_provider' }),
    db.collection('ats_interview_settings').createIndex({ tenant_id: 1 }, { unique: true, name: 'ats_interview_settings_tenant' }),
  ]).catch((e) => {
    ready = null
    console.error('[ats/interviews] index build failed', e)
  })
  await ready
}

export async function atsInterviews(): Promise<Collection<AtsInterviewDoc>> {
  await ensure()
  return (await getMongoDb()).collection<AtsInterviewDoc>('ats_interviews')
}

export async function meetingIntegrations(): Promise<Collection<MeetingIntegrationDoc>> {
  await ensure()
  return (await getMongoDb()).collection<MeetingIntegrationDoc>('ats_meeting_integrations')
}

export async function interviewSettings(): Promise<Collection<InterviewSettingsDoc>> {
  await ensure()
  return (await getMongoDb()).collection<InterviewSettingsDoc>('ats_interview_settings')
}

/** Strip server bookkeeping. Host links only for people who run the meeting. */
export function publicInterview(doc: AtsInterviewDoc, opts: { showHost: boolean }) {
  const {
    _id, sent, token_nonce, entry_key, provider_account, last_error, host_url, invite_delivery, ...rest
  } = doc as AtsInterviewDoc & { _id?: unknown }
  void _id; void sent; void token_nonce; void entry_key; void provider_account; void invite_delivery // schedulers get it via the detail route
  return { ...rest, host_url: opts.showHost ? host_url ?? null : null, last_error: opts.showHost ? last_error ?? null : null }
}
export type PublicInterview = ReturnType<typeof publicInterview>
