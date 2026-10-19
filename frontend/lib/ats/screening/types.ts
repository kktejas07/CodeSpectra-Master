/**
 * Bot screening — internal types (lib/ats/screening). The shared shapes
 * (ScreeningCall, BotChannel, StageConfig) live in lib/ats/contract.ts; this
 * file only adds what the screening part stores on top of them.
 */
import type { BotChannel, ScreeningCall, StageConfig } from '@/lib/ats/contract'

export type BotScreenConfig = Extract<StageConfig, { kind: 'bot_screen' }>
export type ScreeningQuestion = BotScreenConfig['questions'][number]

/** Providers per channel. 'simulated' is used when the real one is not configured (and in tests). */
export type ChatProvider = 'meta_whatsapp' | 'simulated'
export type VoiceProvider = 'vapi' | 'webhook' | 'simulated'
export type NumberProvider = 'vapi' | 'exotel' | 'twilio'

/** One region's numbers. Keyed by ISO-2 country (or '*' for the tenant default). */
export interface RegionNumber {
  /** Meta WhatsApp Cloud API phone_number_id used for chat + WhatsApp calls in this region */
  whatsapp_phone_number_id?: string | null
  /** display number of the WhatsApp sender, E.164 (shown to recruiters only) */
  whatsapp_display_number?: string | null
  /** regional PSTN caller number, E.164 */
  call_number?: string | null
  /** Vapi phoneNumberId of `call_number` (imported from Exotel/Twilio or bought in Vapi) */
  vapi_phone_number_id?: string | null
  /** carrier behind `call_number` (documentation / status webhooks) */
  provider?: NumberProvider
}

export interface TenantScreeningSettings {
  tenant_id: string
  regions: Record<string, RegionNumber>
  /** approved template names (Meta). Body params: {{1}} candidate name, {{2}} job title. */
  template_chat?: string | null
  template_call?: string | null
  template_language?: string | null
  /** SIP URI / dial endpoint of the tenant's own voice agent (overrides the platform one) */
  voice_agent_sip_uri?: string | null
  /** candidate local-time window for outreach, 24h clock */
  quiet_hours?: { start: number; end: number }
  /** hours without a reply before a reminder / before the attempt times out */
  reminder_after_hours?: number
  reply_timeout_hours?: number
  /** hours to wait for a WhatsApp call permission before falling back */
  permission_timeout_hours?: number
  /** hours between call retries after no answer */
  retry_delay_hours?: number
  updated_at: string
  updated_by?: string
}

export type ScreeningStep =
  | 'awaiting_consent' // consent/start template sent, waiting for the button
  | 'asking' // whatsapp_chat: waiting for the answer to question_index
  | 'awaiting_permission' // whatsapp_call: call_permission_request sent
  | 'calling' // a voice call is placed / live
  | 'done'

/** Stored document = contract ScreeningCall + screening-internal state. */
export interface ScreeningCallDoc extends ScreeningCall {
  job_id: string
  candidate_id: string
  /** `${app.id}:${stage.id}:${app.stage_entered_at}` — one screening per stage entry */
  entry_key: string
  /** `${entry_key}#${channel}` — unique: one call per (stage entry, channel) */
  entry_channel: string
  /** stage entry this call belongs to (cancel when the application has moved on) */
  stage_entered_at: string
  channel_index: number
  channels: BotChannel[]
  country: string | null
  language: string
  step: ScreeningStep
  question_index: number
  reprompts: number
  /** when the scheduler should look at this call next (quiet hours, reminders, timeouts, retries) */
  next_action_at: string | null
  next_action: 'start' | 'remind' | 'timeout' | 'retry' | null
  last_inbound_at?: string | null
  last_outbound_at?: string | null
  reminder_sent?: boolean
  permission?: { requested_at: string; granted_at?: string | null; expires_at?: string | null; rejected_at?: string | null } | null
  duration_sec?: number | null
  /** carrier call id (Twilio CallSid / Exotel CallSid) when the voice provider reports it */
  carrier_ref?: string | null
  knocked_out?: string[] // question ids
  outcome?: 'pass' | 'fail' | null
  finalized_at?: string | null
  is_test?: boolean
  error?: string | null
  /** WhatsApp phone_number_id this call's messages go out on (scopes inbound replies to the right tenant/call) */
  wa_from?: string | null
}

export const ACTIVE_STATUSES: ScreeningCall['status'][] = ['queued', 'permission_requested', 'ringing', 'in_progress']
