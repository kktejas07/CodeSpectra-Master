/**
 * AI spend: settings, aggregation, budget thresholds and cap sources (pure, client-safe).
 * Server code lives in lib/ai/usage-record.ts; the page is /dashboard/admin/ai-usage.
 */
import { z } from 'zod'
import { cleanPrice, mergePriceBook, priceCall, type ModelPrice, type PriceBook, type UnknownPrice } from './pricing'

// ─── Settings ───────────────────────────────────────────────────────────────

export interface AiCostSettings {
  /** Admin price overrides (replace/extend the seed price book). */
  prices: ModelPrice[]
  unknown: UnknownPrice
  /** Platform-wide monthly AI budget in USD; 0 = no budget (no alerts, no stop). */
  monthly_budget_usd: number
  /** At 100% of the budget, refuse AI calls from non-critical features. */
  hard_stop: boolean
  /** Feature ids (or "prefix*") that stop at 100% when hard_stop is on. */
  non_critical_features: string[]
  /**
   * INR per USD for showing spend in rupees. Set by a superadmin: billing has
   * per-currency plan prices (parity pricing), not an exchange rate, so there
   * is nothing better to derive it from.
   */
  usd_inr_rate: number
  /** When a superadmin last changed the rate (ISO); null = still the default. Server-set. */
  usd_inr_rate_updated_at: string | null
}

/**
 * Content generators and bots — nice to have, safe to pause. Grading, proctoring,
 * hiring, interviews and moderation are NOT here so they keep working at 100%.
 */
export const DEFAULT_NON_CRITICAL = [
  'question-bot', 'signals-*', 'blog-*', 'learn-*', 'events-feed-summary', 'ebook-outline', 'course-video-*',
  'study-plan-note', 'company-tests:generate', 'generate-problem*', 'module-quiz', 'arena-adapt', 'generate-course',
  'cover-image', 'social_studio', 'daily_digest',
]

export const DEFAULT_AI_COST_SETTINGS: AiCostSettings = {
  prices: [],
  unknown: { inputPer1M: 1, outputPer1M: 4, perMinute: 0.01, perImage: 0.08 },
  monthly_budget_usd: 0,
  hard_stop: false,
  non_critical_features: DEFAULT_NON_CRITICAL,
  usd_inr_rate: 84,
  usd_inr_rate_updated_at: null,
}

const featureId = z.string().trim().regex(/^[A-Za-z0-9_:.-]{1,60}\*?$/)

export const AiCostSettingsPatch = z.object({
  prices: z.array(z.unknown()).max(300).optional(),
  unknown: z.object({
    inputPer1M: z.coerce.number().min(0).max(10_000),
    outputPer1M: z.coerce.number().min(0).max(10_000),
    perMinute: z.coerce.number().min(0).max(100),
    perImage: z.coerce.number().min(0).max(1000).optional(),
  }).optional(),
  monthly_budget_usd: z.coerce.number().min(0).max(1_000_000).optional(),
  hard_stop: z.boolean().optional(),
  non_critical_features: z.array(featureId).max(100).optional(),
  usd_inr_rate: z.coerce.number().min(1).max(1000).optional(),
}).strict()

/** Stored doc → settings (bad or missing values fall back to defaults). Pure. */
export function mergeAiCostSettings(raw: unknown): AiCostSettings {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const r = AiCostSettingsPatch.partial().safeParse(Object.fromEntries(Object.entries(d).filter(([k]) => k in DEFAULT_AI_COST_SETTINGS && k !== 'usd_inr_rate_updated_at')))
  const at = typeof d.usd_inr_rate_updated_at === 'string' && !Number.isNaN(Date.parse(d.usd_inr_rate_updated_at)) ? d.usd_inr_rate_updated_at : null
  const v = r.success ? r.data : {}
  return {
    prices: (v.prices ?? []).map(cleanPrice).filter((p): p is ModelPrice => !!p),
    unknown: v.unknown ?? DEFAULT_AI_COST_SETTINGS.unknown,
    monthly_budget_usd: v.monthly_budget_usd ?? 0,
    hard_stop: v.hard_stop ?? false,
    non_critical_features: v.non_critical_features ?? DEFAULT_NON_CRITICAL,
    usd_inr_rate: v.usd_inr_rate ?? DEFAULT_AI_COST_SETTINGS.usd_inr_rate,
    usd_inr_rate_updated_at: at,
  }
}

export const bookFor = (s: Pick<AiCostSettings, 'prices' | 'unknown'>): PriceBook => mergePriceBook({ prices: s.prices, unknown: s.unknown })

// ─── Features ───────────────────────────────────────────────────────────────

/** "question-bot:cache-hit" → "question-bot"; empty → "unknown". */
export function baseFeature(feature: string | null | undefined): string {
  const f = String(feature || '').trim()
  return (f.endsWith(':cache-hit') ? f.slice(0, -':cache-hit'.length) : f) || 'unknown'
}

export function featureMatches(feature: string, patterns: readonly string[]): boolean {
  const f = baseFeature(feature)
  return patterns.some((p) => (p.endsWith('*') ? f.startsWith(p.slice(0, -1)) : f === p))
}

// ─── Budget ─────────────────────────────────────────────────────────────────

export const BUDGET_THRESHOLDS = [50, 80, 100] as const
export type BudgetThreshold = (typeof BUDGET_THRESHOLDS)[number]

/** Thresholds reached by going from `prev` to `next` µ$ that have not been alerted yet. Pure. */
export function budgetCrossings(prevMicros: number, nextMicros: number, budgetMicros: number, alreadySent: readonly number[] = []): BudgetThreshold[] {
  if (!(budgetMicros > 0) || !(nextMicros > prevMicros)) return []
  return BUDGET_THRESHOLDS.filter((t) => {
    const line = (budgetMicros * t) / 100
    return nextMicros >= line && prevMicros < line && !alreadySent.includes(t)
  })
}

/** Highest threshold reached (0 when none / no budget). Pure. */
export function budgetLevel(spentMicros: number, budgetMicros: number): 0 | BudgetThreshold {
  if (!(budgetMicros > 0)) return 0
  let lvl: 0 | BudgetThreshold = 0
  for (const t of BUDGET_THRESHOLDS) if (spentMicros * 100 >= budgetMicros * t) lvl = t
  return lvl
}

/** Should a call from `feature` be refused because the monthly budget is used up? Pure. */
export function hardStopApplies(feature: string, s: Pick<AiCostSettings, 'hard_stop' | 'monthly_budget_usd' | 'non_critical_features'>, monthMicros: number): boolean {
  if (!s.hard_stop || !(s.monthly_budget_usd > 0)) return false
  if (monthMicros < Math.round(s.monthly_budget_usd * 1_000_000)) return false
  return featureMatches(feature, s.non_critical_features)
}

// ─── Per-feature caps ───────────────────────────────────────────────────────

/**
 * Which month-to-date spend a feature cap should compare against. The feature's
 * own ledger is now filled from recorded per-call costs (the usage meter carries
 * them), but older rows were token estimates and some calls are only seen by
 * the platform recorder — so take the larger of the two and say which it was.
 */
export function capSpendUsd(ledgerUsd: number, recordedMicros: number | null | undefined): { usd: number; source: 'recorded' | 'estimated' } {
  const ledger = Math.max(0, Number(ledgerUsd) || 0)
  const recorded = recordedMicros && recordedMicros > 0 ? recordedMicros / 1_000_000 : 0
  return recorded >= ledger && recorded > 0
    ? { usd: Math.round(recorded * 1e6) / 1e6, source: 'recorded' }
    : { usd: ledger, source: 'estimated' }
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/** One Mongo $group row over ai_usage (by day × feature × provider × model × tenant). */
export interface SpendGroupRow {
  day: string
  feature: string
  provider: string
  model: string
  tenantId: string | null
  calls: number
  /** Σ costMicros of rows that recorded a cost. */
  costMicros: number
  /** Rows that recorded a cost. */
  costedCalls: number
  /** Rows priced with the unknown-model fallback. */
  unpricedCalls: number
  /** Rows with an estimated (not provider-reported) token count. */
  estimatedTokenCalls: number
  /** Tokens of rows WITHOUT a recorded cost (older rows) — priced now with current prices. */
  legacyInput: number
  legacyOutput: number
  inputTokens: number
  outputTokens: number
  /** Already-estimated µ$ carried by a daily rollup (lib/ai/usage-rollup); not in costMicros. */
  estimatedMicros?: number
}

export interface SpendBucket {
  key: string
  calls: number
  micros: number
  /** Part of `micros` estimated from tokens with current prices (old rows without a cost). */
  estimatedMicros: number
  unpricedCalls: number
  tokens: number
}

export interface SpendSummary {
  totals: SpendBucket
  byDay: SpendBucket[]
  byFeature: SpendBucket[]
  byModel: (SpendBucket & { provider: string; model: string; unpriced: boolean })[]
  byTenant: SpendBucket[]
}

const empty = (key: string): SpendBucket => ({ key, calls: 0, micros: 0, estimatedMicros: 0, unpricedCalls: 0, tokens: 0 })

/** Fold group rows into breakdowns; rows without a recorded cost are estimated now. Pure. */
export function summarizeSpend(rows: readonly SpendGroupRow[], book: PriceBook): SpendSummary {
  const totals = empty('total')
  const day = new Map<string, SpendBucket>(), feat = new Map<string, SpendBucket>(), tenant = new Map<string, SpendBucket>()
  const model = new Map<string, SpendBucket & { provider: string; model: string; unpriced: boolean }>()
  const add = (b: SpendBucket, r: SpendGroupRow, est: number, unpriced: number) => {
    b.calls += r.calls
    b.micros += r.costMicros + est
    b.estimatedMicros += est
    b.unpricedCalls += unpriced
    b.tokens += r.inputTokens + r.outputTokens
  }
  for (const r of rows) {
    const legacyCalls = Math.max(0, r.calls - r.costedCalls)
    let est = Math.max(0, Math.round(r.estimatedMicros ?? 0))
    let unpriced = r.unpricedCalls
    if (legacyCalls > 0 && (r.legacyInput > 0 || r.legacyOutput > 0)) {
      const p = priceCall(book, r.provider, r.model, { inputTokens: r.legacyInput, outputTokens: r.legacyOutput }, 'chat')
      est = p.costMicros
      if (p.unpriced) unpriced += legacyCalls
    }
    add(totals, r, est, unpriced)
    const get = <T extends SpendBucket>(m: Map<string, T>, k: string, mk: () => T) => { let b = m.get(k); if (!b) { b = mk(); m.set(k, b) } return b }
    add(get(day, r.day, () => empty(r.day)), r, est, unpriced)
    const f = baseFeature(r.feature)
    add(get(feat, f, () => empty(f)), r, est, unpriced)
    const t = r.tenantId || 'platform'
    add(get(tenant, t, () => empty(t)), r, est, unpriced)
    const mk = `${r.provider}/${r.model}`
    const mb = get(model, mk, () => ({ ...empty(mk), provider: r.provider, model: r.model, unpriced: false }))
    add(mb, r, est, unpriced)
    if (unpriced > 0) mb.unpriced = true
  }
  const byCost = <T extends SpendBucket>(a: T, b: T) => b.micros - a.micros || b.calls - a.calls
  return {
    totals,
    byDay: [...day.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byFeature: [...feat.values()].sort(byCost),
    byModel: [...model.values()].sort(byCost),
    byTenant: [...tenant.values()].sort(byCost),
  }
}

/** Dense daily µ$ series over `keys` (missing days → 0). Pure. */
export function denseSpend(byDay: readonly SpendBucket[], keys: readonly string[]): number[] {
  const m = new Map(byDay.map((b) => [b.key, b.micros]))
  return keys.map((k) => m.get(k) ?? 0)
}

/** % change from `prev` to `cur`; null when there is nothing to compare with. Pure. */
export function trendPct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

const csvCell = (v: string | number | null) => {
  const raw = v === null ? '' : String(v)
  const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV of group rows (costs in USD, 6 decimals). No prompts or user ids. Pure. */
export function spendCsv(rows: readonly SpendGroupRow[], book: PriceBook): string {
  const head = ['day', 'feature', 'provider', 'model', 'tenant', 'calls', 'input_tokens', 'output_tokens', 'cost_usd', 'estimated_usd', 'unpriced_calls']
  const lines = [head.join(',')]
  for (const r of [...rows].sort((a, b) => a.day.localeCompare(b.day) || a.feature.localeCompare(b.feature))) {
    const s = summarizeSpend([r], book).totals
    lines.push([r.day, baseFeature(r.feature), r.provider, r.model, r.tenantId || 'platform', r.calls, r.inputTokens, r.outputTokens,
      (s.micros / 1e6).toFixed(6), (s.estimatedMicros / 1e6).toFixed(6), s.unpricedCalls].map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}

// ─── Display ────────────────────────────────────────────────────────────────

/** µ$ → amount in USD or INR (at the admin-set rate). Pure. */
export function microsIn(micros: number, currency: 'USD' | 'INR', usdInrRate: number): number {
  const usd = (Number(micros) || 0) / 1_000_000
  return currency === 'INR' ? usd * (usdInrRate > 0 ? usdInrRate : DEFAULT_AI_COST_SETTINGS.usd_inr_rate) : usd
}

/** Fraction digits that keep small AI amounts readable ($0.0042, $3.20, $1,240). Pure. */
export function moneyDigits(amount: number): number {
  const a = Math.abs(amount)
  return a === 0 ? 2 : a < 0.01 ? 4 : a < 1000 ? 2 : 0
}

// ─── Daily rollups (history beyond the raw-row TTL) ─────────────────────────

/** ai_usage rows expire after 90 days; days older than this are read from ai_usage_daily. */
export const RAW_WINDOW_DAYS = 85
/** Days (re)computed per rollup run at most (first run backfills in chunks). */
export const ROLLUP_MAX_DAYS = 100

const DAY_MS = 86_400_000
export const dayOf = (d: Date): string => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number): string => dayOf(new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS))

/** First UTC day served from rollups instead of raw rows (exclusive upper bound for history). */
export function rawCutoffDay(now: Date): string {
  return addDays(dayOf(now), -RAW_WINDOW_DAYS)
}

/**
 * Days a rollup run should (re)compute, oldest first. Pure.
 * - first run (nothing rolled yet): backfill from the oldest raw day;
 * - later runs: re-roll the last rolled day (late rows) up to yesterday;
 * - never today (still filling), never more than `max` days per run.
 */
export function rollupDays(lastRolled: string | null, earliestRaw: string | null, now: Date, max = ROLLUP_MAX_DAYS): string[] {
  const yesterday = addDays(dayOf(now), -1)
  const start = lastRolled ? lastRolled : earliestRaw
  if (!start || start > yesterday) return []
  const out: string[] = []
  for (let d = start; d <= yesterday && out.length < max; d = addDays(d, 1)) out.push(d)
  return out
}

export interface RollupDoc {
  id: string
  day: string
  feature: string
  provider: string
  model: string
  tenantId: string | null
  calls: number
  inputTokens: number
  outputTokens: number
  /** Recorded µ$ (calls priced when they ran). */
  cost_micro: number
  /** µ$ estimated from tokens for rows without a recorded cost (prices at rollup time). */
  estimated_micro: number
  /** Some of this group's cost is an estimate. */
  estimated: boolean
  unpricedCalls: number
}

export const rollupId = (r: Pick<SpendGroupRow, 'day' | 'feature' | 'provider' | 'model' | 'tenantId'>): string =>
  [r.day, r.feature, r.provider, r.model, r.tenantId || '-'].join('|').slice(0, 400)

/** One raw group row → its rollup doc (legacy rows priced now and flagged). Pure. */
export function toRollupDoc(r: SpendGroupRow, book: PriceBook): RollupDoc {
  const s = summarizeSpend([{ ...r, estimatedMicros: 0 }], book).totals
  return {
    id: rollupId(r), day: r.day, feature: r.feature, provider: r.provider, model: r.model, tenantId: r.tenantId,
    calls: r.calls, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    cost_micro: r.costMicros, estimated_micro: s.estimatedMicros, estimated: s.estimatedMicros > 0 || r.estimatedTokenCalls > 0,
    unpricedCalls: s.unpricedCalls,
  }
}

/** Rollup doc → group row for summarizeSpend (estimate carried, not recomputed). Pure. */
export function fromRollupDoc(d: RollupDoc): SpendGroupRow {
  return {
    day: d.day, feature: d.feature, provider: d.provider, model: d.model, tenantId: d.tenantId, calls: d.calls,
    costMicros: d.cost_micro, costedCalls: d.calls, unpricedCalls: d.unpricedCalls, estimatedTokenCalls: d.estimated ? d.calls : 0,
    legacyInput: 0, legacyOutput: 0, inputTokens: d.inputTokens, outputTokens: d.outputTokens, estimatedMicros: d.estimated_micro,
  }
}
