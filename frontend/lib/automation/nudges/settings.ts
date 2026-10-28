/**
 * Nudge settings (superadmin, Admin → Automations → Nudge limits): the shared
 * frequency cap and the tunables of the Wave 15 nudge automations. One doc in
 * automation_settings { key: 'nudges' }. Safe defaults: no coupons, small AI cap.
 */
import { z } from 'zod'
import { col, nowIso } from '../store'
import { NUDGE_CAP_DEFAULTS, BGV_SLA_DEFAULT_DAYS, OFFER_EXPIRY_DEFAULT_DAYS } from './rules'

export interface NudgeSettings {
  cap_daily: number
  cap_weekly: number
  /** Abandoned plan checkout: one-time coupon at 24 h (percent, 0 = no coupon). */
  checkout_coupon_pct: number
  /** Days an ATS offer stays open when the stage sets no deadline. */
  offer_expiry_days: number
  /** Days a vendor background check may take before it is chased. */
  bgv_sla_days: number
  /** Content freshness: AI refresh drafts per day and per month (USD). */
  freshness_ai_daily: number
  freshness_ai_monthly_usd: number
}

export const NUDGE_DEFAULTS: NudgeSettings = {
  cap_daily: NUDGE_CAP_DEFAULTS.daily,
  cap_weekly: NUDGE_CAP_DEFAULTS.weekly,
  checkout_coupon_pct: 0,
  offer_expiry_days: OFFER_EXPIRY_DEFAULT_DAYS,
  bgv_sla_days: BGV_SLA_DEFAULT_DAYS,
  freshness_ai_daily: 5,
  freshness_ai_monthly_usd: 2,
}

export const NudgeSettingsPatch = z.object({
  cap_daily: z.coerce.number().int().min(1).max(10),
  cap_weekly: z.coerce.number().int().min(1).max(30),
  checkout_coupon_pct: z.coerce.number().int().min(0).max(30),
  offer_expiry_days: z.coerce.number().int().min(1).max(60),
  bgv_sla_days: z.coerce.number().int().min(1).max(60),
  freshness_ai_daily: z.coerce.number().int().min(0).max(50),
  freshness_ai_monthly_usd: z.coerce.number().min(0).max(100),
}).partial().strict()

let cache: { v: NudgeSettings; at: number } | null = null

export async function getNudgeSettings(fresh = false): Promise<NudgeSettings> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.v
  const doc = (await (await col('automation_settings')).findOne({ key: 'nudges' }, { projection: { _id: 0 } }).catch(() => null)) as Partial<NudgeSettings> | null
  const parsed = NudgeSettingsPatch.safeParse(Object.fromEntries(Object.entries(doc || {}).filter(([k]) => k in NUDGE_DEFAULTS)))
  const v = { ...NUDGE_DEFAULTS, ...(parsed.success ? parsed.data : {}) }
  cache = { v, at: Date.now() }
  return v
}

export async function saveNudgeSettings(raw: unknown, by: string): Promise<{ ok: true; settings: NudgeSettings } | { ok: false; error: string }> {
  const p = NudgeSettingsPatch.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.issues[0] ? `${p.error.issues[0].path.join('.')}: ${p.error.issues[0].message}` : 'Invalid settings' }
  const next = { ...(await getNudgeSettings(true)), ...p.data }
  if (next.cap_weekly < next.cap_daily) return { ok: false, error: 'cap_weekly: must be at least the daily cap' }
  await (await col('automation_settings')).updateOne({ key: 'nudges' }, { $set: { ...p.data, updated_at: nowIso(), updated_by: by }, $setOnInsert: { key: 'nudges' } }, { upsert: true })
  cache = null
  return { ok: true, settings: next }
}
