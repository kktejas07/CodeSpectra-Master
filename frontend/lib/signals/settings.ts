/**
 * Signals (tech news) settings + AI spend caps. Pure, client-safe.
 *
 * Every ingested item costs three model calls (facts → draft → humanise).
 * Safe defaults: 12 AI rewrites a day, $5 a month, 1 item per feed per run.
 * When a cap is reached the run stops — nothing is drafted without the AI pass
 * except by an admin's explicit "Run now" (which still honours the caps).
 */
import { z } from 'zod'

export interface SignalSettings {
  /** Auto-publish new items from trusted feeds (owner's decision: on). */
  auto_publish_trusted: boolean
  /** Max AI-rewritten items per UTC day (all runs together). */
  daily_ai_cap: number
  /** Monthly AI spend cap in USD (estimated from tokens). */
  monthly_cost_cap_usd: number
  /** Items taken from each feed per run. */
  items_per_feed: number
  /** Daily news digest to subscribers of topic 'news'. */
  digest_enabled: boolean
  /** Local hour in digest_timezone the digest goes out. */
  digest_hour: number
  digest_timezone: string
  /** Approved Meta template for the WhatsApp digest outside the 24 h window ({{1}} = headlines, {{2}} = link). */
  whatsapp_template_digest: string
}

export const DEFAULT_SIGNAL_SETTINGS: SignalSettings = {
  auto_publish_trusted: true,
  daily_ai_cap: 12,
  monthly_cost_cap_usd: 5,
  items_per_feed: 1,
  digest_enabled: true,
  digest_hour: 8,
  digest_timezone: 'Asia/Kolkata',
  whatsapp_template_digest: '',
}

const tz = z.string().max(64).refine((v) => { try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true } catch { return false } }, 'Unknown time zone')

export const SignalSettingsPatchSchema = z.object({
  auto_publish_trusted: z.boolean().optional(),
  daily_ai_cap: z.coerce.number().int().min(0).max(500).optional(),
  monthly_cost_cap_usd: z.coerce.number().min(0).max(1000).optional(),
  items_per_feed: z.coerce.number().int().min(1).max(5).optional(),
  digest_enabled: z.boolean().optional(),
  digest_hour: z.coerce.number().int().min(0).max(23).optional(),
  digest_timezone: tz.optional(),
  whatsapp_template_digest: z.string().max(120).transform((v) => v.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')).optional(),
}).strict()

export function cleanSignalSettingsPatch(raw: unknown): { ok: true; patch: Partial<SignalSettings> } | { ok: false; error: string } {
  const r = SignalSettingsPatchSchema.safeParse(raw)
  if (!r.success) {
    const i = r.error.issues[0]
    return { ok: false, error: i ? `${i.path.join('.') || 'settings'}: ${i.message}` : 'Invalid settings' }
  }
  const patch: Partial<SignalSettings> = {}
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined) (patch as Record<string, unknown>)[k] = v
  if (typeof patch.monthly_cost_cap_usd === 'number') patch.monthly_cost_cap_usd = Math.round(patch.monthly_cost_cap_usd * 100) / 100
  return { ok: true, patch }
}

/** Merge a stored doc with defaults, dropping anything invalid. */
export function normalizeSignalSettings(doc: Record<string, unknown> | null | undefined): SignalSettings {
  const out: SignalSettings = { ...DEFAULT_SIGNAL_SETTINGS }
  if (!doc) return out
  for (const k of Object.keys(DEFAULT_SIGNAL_SETTINGS) as (keyof SignalSettings)[]) {
    const one = SignalSettingsPatchSchema.safeParse({ [k]: doc[k] })
    if (one.success && one.data[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = one.data[k]
  }
  return out
}

export interface SignalUsage {
  /** UTC day (YYYY-MM-DD) the count is for. */
  day: string | null
  day_count: number
  /** YYYY-MM the cost is for. */
  month: string | null
  month_cost_usd: number
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const monthKey = (d: Date) => d.toISOString().slice(0, 7)

/** Pure: how many AI rewrites this run may still do (0 = stop), and why not. */
export function aiBudget(s: Pick<SignalSettings, 'daily_ai_cap' | 'monthly_cost_cap_usd'>, u: Partial<SignalUsage> | null | undefined, now: Date): { items: number; blocked?: string } {
  const today = u?.day === dayKey(now) ? u.day_count || 0 : 0
  const spent = u?.month === monthKey(now) ? u.month_cost_usd || 0 : 0
  if (s.monthly_cost_cap_usd <= 0 || spent >= s.monthly_cost_cap_usd) return { items: 0, blocked: `Monthly AI cap reached ($${spent.toFixed(2)} of $${s.monthly_cost_cap_usd.toFixed(2)})` }
  const left = Math.max(0, s.daily_ai_cap - today)
  return left ? { items: left } : { items: 0, blocked: `Daily AI cap reached (${today} of ${s.daily_ai_cap})` }
}

/** Pure: should an ingested item be published without review? */
export function shouldAutoPublish(o: { trusted: boolean; autoPublishTrusted: boolean; aiRewritten: boolean; flagged: boolean; factsVerified?: boolean }): boolean {
  // A fallback (non-AI) draft, text that tripped the prompt guard, or (AGT-031) a draft the fact
  // verifier did not pass always waits for a human. `factsVerified` omitted = not checked = not trusted.
  return o.trusted && o.autoPublishTrusted && o.aiRewritten && !o.flagged && o.factsVerified === true
}
