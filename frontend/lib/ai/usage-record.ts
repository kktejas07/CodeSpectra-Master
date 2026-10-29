/**
 * Record what every AI call cost (server only).
 *
 *   recordAiUsage({ feature, provider, model, inputTokens, outputTokens, cachedTokens, audioSeconds, userId?, tenantId? })
 *
 * prices the call with the price book in force right now (lib/ai/pricing seeds +
 * admin overrides in platform_settings `ai_cost`), returns the cost at once
 * (integer micro-dollars) and, fire-and-forget, appends the row to `ai_usage`
 * (the collection the admin overview reads) and bumps the month counters in
 * `ai_spend_counters` that feature caps and the platform budget read. Prompts,
 * outputs and user text are never stored — only ids, counts and money.
 *
 * Old `ai_usage` rows have no `costMicros`; readers estimate them from tokens
 * with current prices and flag the result as estimated (lib/ai/spend).
 */
// ponytail: deliberately NO `import 'server-only'` here. The course worker runs
// this same file under plain `tsx` (scripts/docker-entrypoint.sh → COURSE_WORKER=1),
// where Next's server-only alias doesn't exist and the import throws
// "Cannot find module 'server-only'" — that killed every lesson's LLM call.
// The guard is redundant anyway: every server dep below is lazy
// (@/lib/mongodb, @/lib/notifications), so a client-side import still fails the
// Next build. Regression test: tests/course-worker-modules.test.ts.
import { DEFAULT_PRICE_BOOK, priceCall, setActivePriceBook, type PriceBook, type PricedCall, type PriceKind } from './pricing'
import { baseFeature, bookFor, budgetCrossings, DEFAULT_AI_COST_SETTINGS, hardStopApplies, mergeAiCostSettings, type AiCostSettings, type BudgetThreshold } from './spend'

export interface RecordAiUsageInput {
  feature: string
  provider: string
  model: string
  inputTokens?: number | null
  outputTokens?: number | null
  cachedTokens?: number | null
  audioSeconds?: number | null
  /** Image generation: images made and their size (priced per image). */
  images?: number | null
  imageSize?: string | null
  /** Price as embedding/speech/image/chat (default: speech when audioSeconds > 0, else chat). */
  kind?: PriceKind
  userId?: string
  tenantId?: string | null
  latencyMs?: number
  ok?: boolean
  /** Token counts are estimates (provider returned none). */
  tokensEstimated?: boolean
  /** Prompt-guard reasons (log-only). */
  injectionFlags?: string[]
  now?: Date
}

export interface AiUsageRow {
  userId?: string
  tenantId?: string | null
  feature: string
  provider: string
  model: string
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens?: number
  audioSeconds?: number
  images?: number
  imageSize?: string
  costMicros: number
  unpriced: boolean
  tokensEstimated: boolean
  rates: PricedCall['rates']
  latencyMs: number
  ok: boolean
  injectionFlags: string[]
  createdAt: Date
}

const SETTINGS_KEY = 'ai_cost'
const COUNTERS = 'ai_spend_counters'
const TTL = 60_000

export const monthKeyOf = (d: Date): string => d.toISOString().slice(0, 7)

// ─── Settings + price book (cached; sync read for the hot path) ─────────────

let cache: { at: number; settings: AiCostSettings; book: PriceBook } | null = null
let loading: Promise<AiCostSettings> | null = null

async function db() {
  const { getMongoDb } = await import('@/lib/mongodb')
  return getMongoDb()
}

let indexed: Promise<unknown> | null = null
async function countersCol() {
  const d = await db()
  if (!indexed) {
    indexed = Promise.all([
      d.collection(COUNTERS).createIndex({ id: 1 }, { unique: true, name: 'ai_spend_counters_id' }),
      d.collection(COUNTERS).createIndex({ kind: 1, month: -1 }, { name: 'ai_spend_counters_kind_month' }),
      d.collection('ai_usage').createIndex({ createdAt: -1, feature: 1 }, { name: 'ai_usage_time_feature' }),
    ]).catch(() => { indexed = null })
  }
  return d.collection(COUNTERS)
}

export async function getAiCostSettings(fresh = false): Promise<AiCostSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.settings
  if (!fresh && loading) return loading
  loading = (async () => {
    try {
      const doc = await (await db()).collection('platform_settings').findOne({ key: SETTINGS_KEY }, { projection: { _id: 0, value: 1 } })
      const settings = mergeAiCostSettings(doc?.value)
      cache = { at: Date.now(), settings, book: bookFor(settings) }
      setActivePriceBook(cache.book)
      return settings
    } catch {
      return cache?.settings ?? DEFAULT_AI_COST_SETTINGS
    } finally {
      loading = null
    }
  })()
  return loading
}

export async function saveAiCostSettings(patch: Partial<AiCostSettings>, actorId: string): Promise<AiCostSettings> {
  const prev = await getAiCostSettings(true)
  const rateChanged = patch.usd_inr_rate !== undefined && patch.usd_inr_rate !== prev.usd_inr_rate
  const next = mergeAiCostSettings({ ...prev, ...patch, usd_inr_rate_updated_at: rateChanged ? new Date().toISOString() : prev.usd_inr_rate_updated_at })
  await (await db()).collection('platform_settings').updateOne(
    { key: SETTINGS_KEY },
    { $set: { key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString(), updated_by: actorId } },
    { upsert: true },
  )
  cache = { at: Date.now(), settings: next, book: bookFor(next) }
  setActivePriceBook(cache.book)
  monthCache = null
  return next
}

/** Price book in force now (sync; refreshes in the background when stale). */
export function activePriceBook(): PriceBook {
  if (!cache || Date.now() - cache.at >= TTL) void getAiCostSettings().catch(() => undefined)
  return cache?.book ?? DEFAULT_PRICE_BOOK
}

// ─── Recording ──────────────────────────────────────────────────────────────

const nonNeg = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

/** Pure: the row stored for one call. Exported for tests. */
export function buildUsageRow(input: RecordAiUsageInput, book: PriceBook): AiUsageRow {
  const priced = priceCall(book, input.provider, input.model, {
    inputTokens: input.inputTokens, outputTokens: input.outputTokens, cachedTokens: input.cachedTokens, audioSeconds: input.audioSeconds,
    images: input.images, imageSize: input.imageSize,
  }, input.kind)
  const audio = typeof input.audioSeconds === 'number' && input.audioSeconds > 0 ? Math.round(input.audioSeconds * 1000) / 1000 : undefined
  const cached = nonNeg(input.cachedTokens)
  return {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    feature: input.feature || 'unknown',
    provider: input.provider || 'unknown',
    model: input.model || 'unknown',
    promptTokens: nonNeg(input.inputTokens),
    completionTokens: nonNeg(input.outputTokens),
    ...(cached ? { cachedTokens: cached } : {}),
    ...(audio ? { audioSeconds: audio } : {}),
    ...(input.images && input.images > 0 ? { images: Math.floor(input.images), ...(input.imageSize ? { imageSize: String(input.imageSize).slice(0, 20) } : {}) } : {}),
    costMicros: input.ok === false ? 0 : priced.costMicros,
    unpriced: priced.unpriced,
    tokensEstimated: input.tokensEstimated === true,
    rates: priced.rates,
    latencyMs: nonNeg(input.latencyMs) ?? 0,
    ok: input.ok !== false,
    injectionFlags: Array.isArray(input.injectionFlags) ? input.injectionFlags.slice(0, 20) : [],
    createdAt: input.now ?? new Date(),
  }
}

/**
 * Price + record one AI call. Never throws, never blocks: the cost is returned
 * immediately, the writes happen in the background.
 */
export function recordAiUsage(input: RecordAiUsageInput): { costMicros: number; unpriced: boolean } {
  try {
    const row = buildUsageRow(input, activePriceBook())
    void persist(row).catch(() => undefined)
    return { costMicros: row.costMicros, unpriced: row.unpriced }
  } catch {
    return { costMicros: 0, unpriced: false }
  }
}

async function persist(row: AiUsageRow): Promise<void> {
  const d = await db()
  await d.collection<AiUsageRow>('ai_usage').insertOne({ ...row })
  if (!row.ok) return
  const month = monthKeyOf(row.createdAt)
  const col = await countersCol()
  const feature = baseFeature(row.feature)
  const inc = { micros: row.costMicros, calls: 1 }
  const [total] = await Promise.all([
    col.findOneAndUpdate(
      { id: `m:${month}` },
      { $inc: inc, $setOnInsert: { id: `m:${month}`, kind: 'month', month, alerts: [] } },
      { upsert: true, returnDocument: 'after', projection: { _id: 0, micros: 1, alerts: 1 } },
    ),
    col.updateOne(
      { id: `f:${month}:${feature}` },
      { $inc: inc, $setOnInsert: { id: `f:${month}:${feature}`, kind: 'feature', month, feature } },
      { upsert: true },
    ),
  ])
  if (monthCache && monthCache.month === month) monthCache.micros += row.costMicros
  if (row.costMicros > 0 && total) {
    const after = Number((total as { micros?: number }).micros) || 0
    await maybeAlert(month, after - row.costMicros, after, ((total as { alerts?: number[] }).alerts) ?? []).catch(() => undefined)
  }
}

// ─── Reading counters ───────────────────────────────────────────────────────

let monthCache: { month: string; at: number; micros: number } | null = null

/** Platform AI spend this month in µ$ (counter; cached 30 s). 0 when unreadable. */
export async function monthSpendMicros(now = new Date(), fresh = false): Promise<number> {
  const month = monthKeyOf(now)
  if (!fresh && monthCache && monthCache.month === month && Date.now() - monthCache.at < 30_000) return monthCache.micros
  try {
    const doc = await (await countersCol()).findOne({ id: `m:${month}` }, { projection: { _id: 0, micros: 1 } })
    const micros = Number(doc?.micros) || 0
    monthCache = { month, at: Date.now(), micros }
    return micros
  } catch {
    return monthCache?.month === month ? monthCache.micros : 0
  }
}

/** Recorded µ$ this month for features (exact ids or "prefix*"). null when unreadable. */
export async function featureSpendMicros(features: readonly string[], now = new Date()): Promise<number | null> {
  try {
    const month = monthKeyOf(now)
    const exact = features.filter((f) => !f.endsWith('*'))
    const prefixes = features.filter((f) => f.endsWith('*')).map((f) => f.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const or: Record<string, unknown>[] = []
    if (exact.length) or.push({ feature: { $in: exact } })
    for (const p of prefixes) or.push({ feature: { $regex: `^${p}` } })
    if (!or.length) return 0
    const rows = await (await countersCol()).aggregate<{ micros: number }>([
      { $match: { kind: 'feature', month, $or: or } },
      { $group: { _id: null, micros: { $sum: '$micros' } } },
    ]).toArray()
    return rows[0]?.micros ?? 0
  } catch {
    return null
  }
}

/**
 * Month-to-date spend for a feature cap: the feature's own ledger vs. what the
 * platform recorded for it (lib/ai/spend capSpendUsd). Never throws.
 */
export async function capSpendFor(features: readonly string[], ledgerUsd: number, now = new Date()): Promise<number> {
  const { capSpendUsd } = await import('./spend')
  return capSpendUsd(ledgerUsd, await featureSpendMicros(features, now)).usd
}

/** True when the platform budget is used up and `feature` is non-critical with hard stop on. */
export async function aiBudgetBlocks(feature: string | undefined): Promise<boolean> {
  try {
    const s = await getAiCostSettings()
    if (!s.hard_stop || !(s.monthly_budget_usd > 0)) return false
    return hardStopApplies(feature || 'unknown', s, await monthSpendMicros())
  } catch {
    return false
  }
}

export class AiBudgetExceededError extends Error {
  readonly code = 'ai_budget_exceeded'
  readonly status = 429
  constructor(feature: string) {
    super(`The monthly AI budget is used up; ${feature} is paused until next month or until a superadmin raises the budget.`)
  }
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

async function maybeAlert(month: string, prev: number, next: number, sent: readonly number[]): Promise<void> {
  const s = await getAiCostSettings()
  const budget = Math.round(s.monthly_budget_usd * 1_000_000)
  const crossed = budgetCrossings(prev, next, budget, sent)
  if (!crossed.length) return
  const col = await countersCol()
  for (const t of crossed) {
    // Claim the threshold once per month (concurrent writers race on $ne).
    const claimed = await col.updateOne({ id: `m:${month}`, alerts: { $ne: t } }, { $addToSet: { alerts: t } })
    if (claimed.modifiedCount !== 1) continue
    try {
      await sendBudgetAlert(t, next, s, month)
    } catch (e) {
      // AUTO-091: release the claim so the next usage record retries this alert.
      await col.updateOne({ id: `m:${month}` }, { $pull: { alerts: t } } as never).catch(() => {})
      console.error(`[ai-cost] budget alert ${t}% failed, will retry:`, (e as Error)?.message)
    }
  }
}

async function sendBudgetAlert(threshold: BudgetThreshold, spentMicros: number, s: AiCostSettings, month: string): Promise<void> {
  const { notifySuperAdmins } = await import('@/lib/notifications')
  const spent = (spentMicros / 1e6).toFixed(2)
  const budget = s.monthly_budget_usd.toFixed(2)
  const stopNote = threshold === 100 && s.hard_stop ? 'stopped' : 'running'
  // notifySuperAdmins never throws; 0 delivered means it failed (DB/mail down), so throw to retry (AUTO-091).
  const delivered = await notifySuperAdmins({
    type: 'ai.budget_alert',
    title: `AI spend reached ${threshold}% of the monthly budget`,
    message: `$${spent} of $${budget} used in ${month}.`,
    title_i18n: { key: 'aiBudget.title', params: { pct: threshold } },
    message_i18n: [
      { key: 'aiBudget.message', params: { spent, budget, month } },
      ...(threshold === 100 ? [{ key: stopNote === 'stopped' ? 'aiBudget.stopped' : 'aiBudget.notStopped' }] : []),
    ],
    link: '/dashboard/admin/ai-usage',
    icon: 'alert-circle',
    send_email: true,
    urgent: threshold === 100,
    metadata: { threshold, month },
  })
  if (!delivered) throw new Error('budget alert not delivered')
}
