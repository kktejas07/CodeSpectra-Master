/**
 * Screening configuration: platform keys (superadmin → platform_settings.secrets,
 * env fallback) + per-tenant settings (numbers per region, templates, timings).
 * Secrets never leave the server; `connectionStatus()` returns booleans only.
 */
import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import { parseRegionMap, type PlatformNumbers } from './regions'
import { DEFAULT_QUIET_HOURS } from './quiet-hours'
import type { TenantScreeningSettings } from './types'
import { settingsCol } from './store'

export interface PlatformScreeningConfig {
  whatsapp: {
    access_token: string | null
    app_secret: string | null
    verify_token: string | null
    phone_number_id: string | null
    waba_id: string | null
    graph_version: string
    template_chat: string
    template_call: string
    template_language: string
    /** 'sip' = number has SIP enabled, the voice agent dials sip:+user@wa.meta.vc; 'graph' = POST /calls with an SDP offer from the voice agent bridge */
    call_mode: 'sip' | 'graph'
  }
  voice: {
    vapi_api_key: string | null
    vapi_webhook_secret: string | null
    /** ISO-2 → Vapi phoneNumberId for PSTN calls */
    vapi_numbers: Record<string, string>
    /** Vapi phoneNumberId of a BYO SIP trunk pointed at wa.meta.vc (WhatsApp calls through Vapi) */
    vapi_whatsapp_trunk_number_id: string | null
    /** SIP URI of the voice agent (Vapi / LiveKit SIP agent) — set on the WhatsApp number's SIP settings */
    voice_agent_sip_uri: string | null
    /** generic voice-agent dialer (e.g. a LiveKit agent service): POST {to_sip_uri|sdp...} */
    voice_agent_webhook_url: string | null
    voice_agent_webhook_secret: string | null
    deepgram_api_key: string | null
    twilio_auth_token: string | null
    exotel_webhook_token: string | null
  }
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && !isMaskedSecret(s) ? s : null
}

export async function getPlatformConfig(): Promise<PlatformScreeningConfig> {
  const s = (await readServerSecrets()) as Record<string, string | undefined>
  const env = process.env
  const pick = (k: string) => clean(s[k]) ?? clean(env[k.toUpperCase()])
  return {
    whatsapp: {
      access_token: pick('meta_whatsapp_access_token'),
      app_secret: pick('meta_whatsapp_app_secret'),
      verify_token: pick('meta_whatsapp_verify_token'),
      phone_number_id: pick('meta_whatsapp_phone_number_id'),
      waba_id: pick('meta_whatsapp_waba_id'),
      graph_version: pick('meta_whatsapp_graph_version') || 'v23.0',
      template_chat: pick('meta_whatsapp_template_chat') || 'candidate_screening_chat',
      template_call: pick('meta_whatsapp_template_call') || 'candidate_screening_call',
      template_language: pick('meta_whatsapp_template_language') || 'en',
      call_mode: pick('meta_whatsapp_call_mode') === 'graph' ? 'graph' : 'sip',
    },
    voice: {
      vapi_api_key: pick('vapi_api_key'),
      vapi_webhook_secret: pick('vapi_webhook_secret'),
      vapi_numbers: parseRegionMap(pick('vapi_phone_number_ids')),
      vapi_whatsapp_trunk_number_id: pick('vapi_whatsapp_trunk_number_id'),
      voice_agent_sip_uri: pick('voice_agent_sip_uri'),
      voice_agent_webhook_url: pick('voice_agent_webhook_url'),
      voice_agent_webhook_secret: pick('voice_agent_webhook_secret'),
      deepgram_api_key: pick('deepgram_api_key'),
      twilio_auth_token: pick('twilio_auth_token'),
      exotel_webhook_token: pick('exotel_webhook_token'),
    },
  }
}

export function platformNumbers(cfg: PlatformScreeningConfig): PlatformNumbers {
  return { whatsapp_phone_number_id: cfg.whatsapp.phone_number_id, vapi_numbers: cfg.voice.vapi_numbers }
}

export const whatsappReady = (c: PlatformScreeningConfig) => Boolean(c.whatsapp.access_token && c.whatsapp.app_secret)
export const vapiReady = (c: PlatformScreeningConfig) => Boolean(c.voice.vapi_api_key && c.voice.vapi_webhook_secret)
/** WhatsApp calls need the Meta side plus a voice agent that can take the call */
export const whatsappCallReady = (c: PlatformScreeningConfig) =>
  whatsappReady(c) && Boolean(
    (c.whatsapp.call_mode === 'sip' && ((vapiReady(c) && c.voice.vapi_whatsapp_trunk_number_id) || c.voice.voice_agent_webhook_url)) ||
    (c.whatsapp.call_mode === 'graph' && c.voice.voice_agent_webhook_url),
  )

export interface ResolvedTenantSettings extends TenantScreeningSettings {
  quiet_hours: { start: number; end: number }
  reminder_after_hours: number
  reply_timeout_hours: number
  permission_timeout_hours: number
  retry_delay_hours: number
}

export function withDefaults(t: Partial<TenantScreeningSettings> | null, tenantId: string): ResolvedTenantSettings {
  return {
    tenant_id: tenantId,
    regions: t?.regions || {},
    template_chat: t?.template_chat || null,
    template_call: t?.template_call || null,
    template_language: t?.template_language || null,
    voice_agent_sip_uri: t?.voice_agent_sip_uri || null,
    quiet_hours: t?.quiet_hours || DEFAULT_QUIET_HOURS,
    reminder_after_hours: t?.reminder_after_hours ?? 4,
    reply_timeout_hours: t?.reply_timeout_hours ?? 23, // inside WhatsApp's 24h service window
    permission_timeout_hours: t?.permission_timeout_hours ?? 24,
    retry_delay_hours: t?.retry_delay_hours ?? 2,
    updated_at: t?.updated_at || '',
    updated_by: t?.updated_by,
  }
}

export async function getTenantSettings(tenantId: string): Promise<ResolvedTenantSettings> {
  const doc = await (await settingsCol()).findOne({ tenant_id: tenantId })
  return withDefaults(doc as TenantScreeningSettings | null, tenantId)
}

/** Booleans only — safe for the settings UI. */
export async function connectionStatus() {
  const c = await getPlatformConfig()
  return {
    whatsapp: {
      access_token: Boolean(c.whatsapp.access_token),
      app_secret: Boolean(c.whatsapp.app_secret),
      verify_token: Boolean(c.whatsapp.verify_token),
      default_number: Boolean(c.whatsapp.phone_number_id),
      ready: whatsappReady(c),
      call_mode: c.whatsapp.call_mode,
      template_chat: c.whatsapp.template_chat,
      template_call: c.whatsapp.template_call,
      template_language: c.whatsapp.template_language,
    },
    whatsapp_call: { ready: whatsappCallReady(c), voice_agent_sip_uri: Boolean(c.voice.voice_agent_sip_uri) },
    vapi: {
      api_key: Boolean(c.voice.vapi_api_key),
      webhook_secret: Boolean(c.voice.vapi_webhook_secret),
      regions: Object.keys(c.voice.vapi_numbers),
      whatsapp_trunk: Boolean(c.voice.vapi_whatsapp_trunk_number_id),
      ready: vapiReady(c),
    },
    voice_agent_webhook: Boolean(c.voice.voice_agent_webhook_url),
    deepgram: Boolean(c.voice.deepgram_api_key),
    twilio: Boolean(c.voice.twilio_auth_token),
    exotel: Boolean(c.voice.exotel_webhook_token),
  }
}
