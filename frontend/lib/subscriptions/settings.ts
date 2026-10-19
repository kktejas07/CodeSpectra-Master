/**
 * Subscription-wide settings (Admin → Events feed → Settings). Meta WhatsApp
 * credentials themselves live in server secrets (Settings → Hiring
 * integrations); only template names and timing live here.
 */
import { getMongoDb } from '@/lib/mongodb'

export interface SubscriptionSettings {
  /** Approved Meta template sent to confirm a new WhatsApp opt-in ("Reply YES to get event alerts"). */
  whatsapp_optin_template: string
  whatsapp_template_language: string
  /** Public WhatsApp number (E.164) shown as "Message START to …" on the subscribe box. */
  whatsapp_display_number: string
  /** Default quiet hours (subscriber's local time) — no WhatsApp in this window. */
  quiet_start_hour: number
  quiet_end_hour: number
}

export const SUBSCRIPTION_DEFAULTS: SubscriptionSettings = {
  whatsapp_optin_template: '',
  whatsapp_template_language: 'en',
  whatsapp_display_number: '',
  quiet_start_hour: 21,
  quiet_end_hour: 8,
}

let cache: { at: number; v: SubscriptionSettings } | null = null

export async function getSubscriptionSettings(): Promise<SubscriptionSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v
  try {
    const doc = await (await getMongoDb()).collection('subscription_settings').findOne({ id: 'default' }, { projection: { _id: 0 } })
    const v = normalizeSubscriptionSettings({ ...SUBSCRIPTION_DEFAULTS, ...(doc || {}) })
    cache = { at: Date.now(), v }
    return v
  } catch {
    return SUBSCRIPTION_DEFAULTS
  }
}

const templateName = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 120) : '')
const hour = (v: unknown, d: number) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 23 ? Number(v) : d)

export function normalizeSubscriptionSettings(o: Record<string, unknown>): SubscriptionSettings {
  return {
    whatsapp_optin_template: templateName(o.whatsapp_optin_template),
    whatsapp_template_language: typeof o.whatsapp_template_language === 'string' && /^[a-z]{2}(_[A-Z]{2})?$/.test(o.whatsapp_template_language) ? o.whatsapp_template_language : 'en',
    whatsapp_display_number: typeof o.whatsapp_display_number === 'string' && /^\+\d{8,15}$/.test(o.whatsapp_display_number.trim()) ? o.whatsapp_display_number.trim() : '',
    quiet_start_hour: hour(o.quiet_start_hour, SUBSCRIPTION_DEFAULTS.quiet_start_hour),
    quiet_end_hour: hour(o.quiet_end_hour, SUBSCRIPTION_DEFAULTS.quiet_end_hour),
  }
}

export async function saveSubscriptionSettings(patch: Record<string, unknown>): Promise<SubscriptionSettings> {
  const current = await getSubscriptionSettings()
  const next = normalizeSubscriptionSettings({ ...current, ...patch })
  await (await getMongoDb()).collection('subscription_settings').updateOne({ id: 'default' }, { $set: { id: 'default', ...next, updated_at: new Date().toISOString() } }, { upsert: true })
  cache = null
  return next
}

export function __resetSubscriptionSettingsCache() { cache = null }
