/**
 * System automation settings: on/off per automation, alert channels and a
 * few tunables. One doc in automation_settings { key: 'system' }.
 * Secrets (the Slack/Teams alert webhook URL) are encrypted at rest when
 * SECRETS_ENCRYPTION_KEY (or the boot session secret) is available.
 */
import { decryptSecretValue, encryptSecretValue, isEncryptedSecret, secretsEncryptionKey } from '@/lib/secrets-crypto'
import { col, nowIso } from './store'

export interface SystemAutomationConfig {
  /** Admin alerts → Slack / Teams incoming webhook (encrypted at rest). */
  alert_webhook_url?: string | null
  /** Extra alert recipients (besides superadmins). */
  alert_emails?: string[]
  /** Hiring: remind recruiters after this many idle days in a stage. */
  hiring_idle_days?: number
  /** Retention (days). 0 = keep forever. */
  retention_proctor_days?: number
  retention_email_log_days?: number
  retention_run_days?: number
  /** WhatsApp template names for system messages (approved in Meta). */
  wa_template_payment?: string
  wa_template_event?: string
  wa_template_language?: string
  /**
   * Interface languages (hi, te) whose translations of these templates are
   * approved in Meta under the same names. Recipients who use one get it;
   * everyone else gets wa_template_language (lib/i18n/whatsapp-language).
   */
  wa_template_locales?: string[]
  /** Generic templates (values: title, message, link) for notices, hiring updates and newsletters. */
  wa_template_notification?: string
  wa_template_hiring?: string
  wa_template_newsletter?: string
  /**
   * Allow the unofficial OpenWA gateway when no approved Meta template fits
   * (AUTO-060). Off by default: numbers can be banned for it. Still only to
   * people who agreed to WhatsApp messages.
   */
  whatsapp_unofficial_enabled?: boolean
}

export const CONFIG_DEFAULTS: Required<Omit<SystemAutomationConfig, 'alert_webhook_url' | 'alert_emails' | 'wa_template_locales' | 'wa_template_payment' | 'wa_template_event' | 'wa_template_notification' | 'wa_template_hiring' | 'wa_template_newsletter' | 'whatsapp_unofficial_enabled'>> = {
  hiring_idle_days: 5,
  retention_proctor_days: 180,
  retention_email_log_days: 180,
  retention_run_days: 90,
  wa_template_language: 'en',
}

export interface SystemSettingsDoc {
  key: 'system'
  toggles: Record<string, boolean>
  config: SystemAutomationConfig
  updated_at?: string
  updated_by?: string
}

let cache: { doc: SystemSettingsDoc; at: number } | null = null

function encKey(): Buffer | null {
  try {
    return secretsEncryptionKey()
  } catch {
    return null
  }
}

export async function encryptValue(v: string): Promise<string> {
  const key = encKey()
  if (!key || !v) return v
  return encryptSecretValue(v, key)
}

export async function decryptValue(v: string | null | undefined): Promise<string | null> {
  if (!v) return null
  if (!isEncryptedSecret(v)) return v
  const key = encKey()
  return key ? decryptSecretValue(v, key) : null
}

export async function getSystemSettings(fresh = false): Promise<SystemSettingsDoc> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.doc
  const c = await col('automation_settings')
  const doc = ((await c.findOne({ key: 'system' }, { projection: { _id: 0 } })) as SystemSettingsDoc | null) || { key: 'system', toggles: {}, config: {} }
  doc.toggles = doc.toggles || {}
  doc.config = doc.config || {}
  cache = { doc, at: Date.now() }
  return doc
}

export function configValue<K extends keyof typeof CONFIG_DEFAULTS>(cfg: SystemAutomationConfig, k: K): (typeof CONFIG_DEFAULTS)[K] {
  const v = cfg[k]
  return (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) ? CONFIG_DEFAULTS[k] : v) as (typeof CONFIG_DEFAULTS)[K]
}

export async function isAutomationEnabled(id: string, defaultOn = true): Promise<boolean> {
  const s = await getSystemSettings()
  const v = s.toggles[id]
  return typeof v === 'boolean' ? v : defaultOn
}

export async function setAutomationEnabled(id: string, enabled: boolean, by: string): Promise<void> {
  const c = await col('automation_settings')
  await c.updateOne({ key: 'system' }, { $set: { [`toggles.${id}`]: enabled, updated_at: nowIso(), updated_by: by }, $setOnInsert: { key: 'system' } }, { upsert: true })
  cache = null
}

const NUM_KEYS = ['hiring_idle_days', 'retention_proctor_days', 'retention_email_log_days', 'retention_run_days'] as const

/** Validate + save config fields (unknown keys ignored). Returns problems. */
export async function saveSystemConfig(raw: Record<string, unknown>, by: string): Promise<string[]> {
  const errs: string[] = []
  const set: Record<string, unknown> = {}
  for (const k of NUM_KEYS) {
    if (raw[k] === undefined) continue
    const n = Math.floor(Number(raw[k]))
    if (!Number.isFinite(n) || n < 0 || n > 3650) errs.push(`${k} must be between 0 and 3650`)
    else if (k === 'hiring_idle_days' && n < 1) errs.push('hiring_idle_days must be at least 1')
    else set[`config.${k}`] = n
  }
  if (raw.alert_webhook_url !== undefined) {
    const u = String(raw.alert_webhook_url || '').trim()
    if (u && !isAllowedChatWebhook(u)) errs.push('Alert webhook must be a Slack or Microsoft Teams incoming-webhook URL')
    else set['config.alert_webhook_url'] = u ? await encryptValue(u) : null
  }
  if (raw.alert_emails !== undefined) {
    const list = (Array.isArray(raw.alert_emails) ? raw.alert_emails : String(raw.alert_emails || '').split(/[,\s]+/))
      .map((e) => String(e).trim().toLowerCase())
      .filter(Boolean)
    const bad = list.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (bad.length) errs.push(`Not an email address: ${bad.slice(0, 3).join(', ')}`)
    else set['config.alert_emails'] = list.slice(0, 20)
  }
  for (const k of ['wa_template_payment', 'wa_template_event', 'wa_template_notification', 'wa_template_hiring', 'wa_template_newsletter'] as const) {
    if (raw[k] === undefined) continue
    const v = String(raw[k] || '').trim()
    if (v && !/^[a-z0-9_]{1,512}$/.test(v)) errs.push(`${k}: template names use lowercase letters, digits and _`)
    else set[`config.${k}`] = v || null
  }
  if (raw.wa_template_language !== undefined) {
    const v = String(raw.wa_template_language || '').trim()
    if (v && !/^[a-z]{2}(_[A-Z]{2})?$/.test(v)) errs.push('wa_template_language looks like en or en_US')
    else set['config.wa_template_language'] = v || 'en'
  }
  if (raw.wa_template_locales !== undefined) {
    const { parseApprovedLocales } = await import('@/lib/i18n/whatsapp-language')
    const list = Array.isArray(raw.wa_template_locales) ? raw.wa_template_locales : String(raw.wa_template_locales || '').split(/[,\s]+/).filter(Boolean)
    const ok = parseApprovedLocales(list)
    if (ok.length !== new Set(list.map((v) => String(v).trim().toLowerCase())).size) errs.push('wa_template_locales: use hi and/or te')
    else set['config.wa_template_locales'] = ok
  }
  if (raw.whatsapp_unofficial_enabled !== undefined) {
    if (typeof raw.whatsapp_unofficial_enabled !== 'boolean') errs.push('whatsapp_unofficial_enabled must be true or false')
    else set['config.whatsapp_unofficial_enabled'] = raw.whatsapp_unofficial_enabled
  }
  if (errs.length) return errs
  const c = await col('automation_settings')
  await c.updateOne({ key: 'system' }, { $set: { ...set, updated_at: nowIso(), updated_by: by }, $setOnInsert: { key: 'system', toggles: {} } }, { upsert: true })
  cache = null
  return []
}

/** Slack / Teams incoming webhooks only (no arbitrary URLs from settings). */
export function isAllowedChatWebhook(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    if (h === 'hooks.slack.com') return u.pathname.startsWith('/services/') || u.pathname.startsWith('/workflows/') || u.pathname.startsWith('/triggers/')
    if (h.endsWith('.webhook.office.com') || h === 'outlook.office.com' || h === 'outlook.office365.com') return true
    if (/\.logic\.azure\.com$/.test(h) || h.endsWith('.environment.api.powerplatform.com')) return true
    return false
  } catch {
    return false
  }
}
