/**
 * AI price book — one place that turns AI usage into money (pure, client-safe).
 *
 * Prices are USD per 1M input / output / cached-input tokens for chat models,
 * USD per 1M input tokens for embeddings and USD per audio minute for speech.
 * Costs are computed in integer micro-dollars (1 USD = 1_000_000 µ$) so sums
 * never drift: every price is first turned into an integer number of µ$ per
 * 1M tokens (or per minute), multiplied by integer token counts, and divided
 * (with rounding) only once per call.
 *
 * The SEED prices below are starting points for the models the app is
 * configured with (lib/ai/provider-fallback chain, backend core/config.py,
 * lib/rag/embed, Deepgram nova-2). They are NOT authoritative vendor prices —
 * check current pricing; superadmins edit them on /dashboard/admin/ai-usage
 * (stored as overrides in platform_settings `ai_cost`). A model with no price
 * is charged at the "unknown model" fallback and flagged `unpriced`.
 */

export type PriceKind = 'chat' | 'embedding' | 'speech'

export interface ModelPrice {
  /** Lowercase model id (or id stem) matched on word boundaries, e.g. "gpt-4o-mini". */
  match: string
  /** Optional provider id; when set, the entry only applies to that provider. */
  provider?: string
  kind: PriceKind
  /** USD per 1M input tokens (chat + embedding). */
  inputPer1M?: number
  /** USD per 1M output tokens (chat). */
  outputPer1M?: number
  /** USD per 1M cached input tokens; missing → billed at the input price. */
  cachedInputPer1M?: number
  /** USD per audio minute (speech). */
  perMinute?: number
  /** Where the entry comes from (set by mergePriceBook). */
  source?: 'seed' | 'admin'
}

export interface UnknownPrice {
  inputPer1M: number
  outputPer1M: number
  perMinute: number
}

export interface PriceBook {
  prices: ModelPrice[]
  unknown: UnknownPrice
}

export interface PriceOverrides {
  prices?: ModelPrice[]
  unknown?: Partial<UnknownPrice>
}

/** Shown next to seeded prices in the editor. */
export const SEED_NOTE = 'Seed price — check current vendor pricing'

/** Free-tier model ids served at no cost by their provider (e.g. "…:free", "…-free"). */
export const FREE_MODEL_RE = /(:free\b|-free\b|\bfree$)/i

export const DEFAULT_UNKNOWN_PRICE: UnknownPrice = { inputPer1M: 1, outputPer1M: 4, perMinute: 0.01 }

const chat = (match: string, inputPer1M: number, outputPer1M: number, cachedInputPer1M?: number, provider?: string): ModelPrice => ({
  match, kind: 'chat', inputPer1M, outputPer1M, ...(cachedInputPer1M !== undefined ? { cachedInputPer1M } : {}), ...(provider ? { provider } : {}),
})

/** Seed prices (USD). Check current pricing — admins override these. */
export const SEED_PRICES: readonly ModelPrice[] = [
  // OpenAI
  chat('gpt-4o-mini', 0.15, 0.6, 0.075),
  chat('gpt-4o', 2.5, 10, 1.25),
  chat('gpt-4-turbo', 10, 30),
  chat('gpt-3.5-turbo', 0.5, 1.5),
  chat('gpt-4.1', 2, 8, 0.5),
  chat('gpt-4.1-mini', 0.4, 1.6, 0.1),
  chat('gpt-4.1-nano', 0.1, 0.4, 0.025),
  chat('o3', 10, 40),
  chat('o3-mini', 1.1, 4.4),
  chat('o4-mini', 1.1, 4.4),
  chat('gpt-oss-120b', 0.15, 0.75),
  chat('gpt-oss-20b', 0.1, 0.5),
  // Anthropic
  chat('claude-3-5-haiku', 0.8, 4, 0.08),
  chat('claude-3.5-haiku', 0.8, 4, 0.08),
  chat('claude-3-haiku', 0.25, 1.25, 0.03),
  chat('claude-haiku-4-5', 1, 5, 0.1),
  chat('claude-3-5-sonnet', 3, 15, 0.3),
  chat('claude-sonnet-4', 3, 15, 0.3),
  chat('claude-sonnet-4-5', 3, 15, 0.3),
  chat('claude-3-opus', 15, 75, 1.5),
  // Google
  chat('gemini-3-flash-preview', 0.3, 2.5, 0.075),
  chat('gemini-2.5-pro', 1.25, 10, 0.31),
  chat('gemini-2.5-flash', 0.3, 2.5, 0.075),
  chat('gemini-2.0-flash', 0.1, 0.4, 0.025),
  chat('gemini-2.0-flash-lite', 0.075, 0.3),
  chat('gemini-1.5-pro', 1.25, 5),
  chat('gemini-1.5-flash', 0.075, 0.3),
  // Open models (Groq / NVIDIA / Cerebras / OpenRouter)
  chat('llama-3.3-70b', 0.59, 0.79),
  chat('llama-3.1-8b', 0.05, 0.08),
  chat('llama-3.1-nemotron-70b', 0.35, 0.4),
  chat('deepseek-chat', 0.14, 0.28),
  chat('deepseek-reasoner', 0.55, 2.19),
  chat('deepseek-v4-pro', 0.27, 1.1),
  chat('deepseek-v4-flash', 0.1, 0.3),
  chat('mistral-large', 2, 6),
  chat('mistral-medium', 0.4, 2),
  chat('mistral-small', 0.1, 0.3),
  chat('command-r-plus', 2.5, 10),
  chat('grok-2', 2, 10),
  // Embeddings (lib/rag/embed)
  { match: 'text-embedding-3-small', kind: 'embedding', inputPer1M: 0.02 },
  { match: 'text-embedding-3-large', kind: 'embedding', inputPer1M: 0.13 },
  { match: 'text-embedding-004', kind: 'embedding', inputPer1M: 0 },
  // Speech-to-text (Deepgram pre-recorded)
  { match: 'nova-2', provider: 'deepgram', kind: 'speech', perMinute: 0.0043 },
  { match: 'nova-3', provider: 'deepgram', kind: 'speech', perMinute: 0.0043 },
]

export const priceKey = (p: Pick<ModelPrice, 'provider' | 'match'>): string => `${(p.provider || '*').toLowerCase()}:${p.match.toLowerCase()}`

const MAX_USD = 10_000
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_USD ? n : undefined
}

/** Validate one admin price row. Pure; returns null when unusable. */
export function cleanPrice(raw: unknown): ModelPrice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const match = typeof r.match === 'string' ? r.match.trim().toLowerCase() : ''
  if (!/^[a-z0-9][a-z0-9._:/@-]{0,119}$/.test(match)) return null
  const provider = typeof r.provider === 'string' && r.provider.trim() ? r.provider.trim().toLowerCase() : undefined
  if (provider && !/^[a-z0-9_-]{1,40}$/.test(provider)) return null
  const kind: PriceKind = r.kind === 'embedding' || r.kind === 'speech' ? r.kind : 'chat'
  const out: ModelPrice = { match, kind, ...(provider ? { provider } : {}) }
  const i = num(r.inputPer1M), o = num(r.outputPer1M), c = num(r.cachedInputPer1M), m = num(r.perMinute)
  if (kind === 'speech') {
    if (m === undefined) return null
    out.perMinute = m
  } else {
    if (i === undefined) return null
    out.inputPer1M = i
    if (kind === 'chat') {
      if (o === undefined) return null
      out.outputPer1M = o
      if (c !== undefined) out.cachedInputPer1M = c
    }
  }
  return out
}

/** Seeds + admin overrides (an override with the same provider+match replaces the seed). Pure. */
export function mergePriceBook(overrides?: PriceOverrides | null): PriceBook {
  const map = new Map<string, ModelPrice>()
  for (const p of SEED_PRICES) map.set(priceKey(p), { ...p, source: 'seed' })
  for (const raw of overrides?.prices ?? []) {
    const p = cleanPrice(raw)
    if (p) map.set(priceKey(p), { ...p, source: 'admin' })
  }
  const u = overrides?.unknown ?? {}
  return {
    prices: [...map.values()],
    unknown: {
      inputPer1M: num(u.inputPer1M) ?? DEFAULT_UNKNOWN_PRICE.inputPer1M,
      outputPer1M: num(u.outputPer1M) ?? DEFAULT_UNKNOWN_PRICE.outputPer1M,
      perMinute: num(u.perMinute) ?? DEFAULT_UNKNOWN_PRICE.perMinute,
    },
  }
}

export const DEFAULT_PRICE_BOOK: PriceBook = mergePriceBook(null)

// The book in force in this process: seeds until the server loads the admin
// overrides (lib/ai/usage-record calls setActivePriceBook). Sync readers —
// metering, legacy estimates — use it so every estimate shares one book.
let active: PriceBook = DEFAULT_PRICE_BOOK
export const getActivePriceBook = (): PriceBook => active
export function setActivePriceBook(book: PriceBook | null): void {
  active = book ?? DEFAULT_PRICE_BOOK
}

/** Legacy USD estimate for a chat call with the active book (feeds older callers). */
export function estimateUsd(model: string, inputTokens: number, outputTokens: number, provider = ''): number {
  return priceCall(getActivePriceBook(), provider, model, { inputTokens, outputTokens }, 'chat').costMicros / 1_000_000
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does `key` name `model` (whole id, or after a "vendor/" prefix, before a "-2024…"/":tag" suffix)? */
export function modelMatches(model: string, key: string): boolean {
  const m = model.toLowerCase().trim()
  const k = key.toLowerCase().trim()
  if (!m || !k) return false
  if (m === k) return true
  return new RegExp(`(^|[/:@ ])${escapeRe(k)}($|[-:@./ ])`).test(m)
}

export interface ResolvedPrice {
  price: ModelPrice
  /** No entry matched: the unknown-model fallback was used. */
  unpriced: boolean
  /** Free-tier model id (charged 0). */
  free: boolean
}

/** Pick the price for a provider/model: provider-specific beats generic, longer match beats shorter. Pure. */
export function resolvePrice(book: PriceBook, provider: string, model: string, kind: PriceKind = 'chat'): ResolvedPrice {
  const prov = (provider || '').toLowerCase().trim()
  const mdl = (model || '').toLowerCase().trim()
  if (mdl && FREE_MODEL_RE.test(mdl)) {
    return { price: { match: mdl, kind, inputPer1M: 0, outputPer1M: 0, perMinute: 0 }, unpriced: false, free: true }
  }
  let best: ModelPrice | null = null
  let bestScore = -1
  for (const p of book.prices) {
    if (p.provider && p.provider !== prov) continue
    if (!modelMatches(mdl, p.match)) continue
    const score = p.match.length * 2 + (p.provider ? 1 : 0) + (p.kind === kind ? 1000 : 0)
    if (score > bestScore) { best = p; bestScore = score }
  }
  if (best) return { price: best, unpriced: false, free: false }
  const u = book.unknown
  return {
    price: { match: mdl || 'unknown', kind, inputPer1M: u.inputPer1M, outputPer1M: kind === 'chat' ? u.outputPer1M : 0, perMinute: u.perMinute },
    unpriced: true,
    free: false,
  }
}

/** USD (per 1M tokens / per minute) → integer µ$ per 1M tokens / per minute. */
export const toMicroRate = (usd: number | undefined): number => Math.max(0, Math.round((Number(usd) || 0) * 1_000_000))

const int = (n: unknown): number => {
  const v = Math.floor(Number(n) || 0)
  return v > 0 ? v : 0
}

export interface UsageAmounts {
  /** All prompt tokens, cached ones included (OpenAI-style `prompt_tokens`). */
  inputTokens?: number | null
  outputTokens?: number | null
  /** Part of inputTokens served from the provider's prompt cache. */
  cachedTokens?: number | null
  /** Speech: audio length in seconds (fractions allowed, counted to the millisecond). */
  audioSeconds?: number | null
}

/** Integer micro-dollars for one call at `price`. Pure; exact integer maths, one rounding. */
export function costMicros(price: ModelPrice, u: UsageAmounts): number {
  if (price.kind === 'speech') {
    const ms = Math.max(0, Math.round((Number(u.audioSeconds) || 0) * 1000))
    // µ$/minute × ms / 60_000 ms
    return Math.round((ms * toMicroRate(price.perMinute)) / 60_000)
  }
  const input = int(u.inputTokens)
  const cached = Math.min(input, int(u.cachedTokens))
  const uncached = input - cached
  const output = price.kind === 'chat' ? int(u.outputTokens) : 0
  const inRate = toMicroRate(price.inputPer1M)
  const cachedRate = price.cachedInputPer1M !== undefined ? toMicroRate(price.cachedInputPer1M) : inRate
  // tokens × (µ$ per 1M tokens) = 1e-6 µ$ units; all integers, divide once.
  const scaled = uncached * inRate + cached * cachedRate + output * toMicroRate(price.outputPer1M)
  return Math.round(scaled / 1_000_000)
}

export interface PricedCall {
  costMicros: number
  unpriced: boolean
  free: boolean
  /** The unit prices that applied (stored with the usage row). */
  rates: { inputPer1M?: number; outputPer1M?: number; cachedInputPer1M?: number; perMinute?: number }
  matched: string
}

/** Resolve + compute in one go. Pure. */
export function priceCall(book: PriceBook, provider: string, model: string, u: UsageAmounts, kind?: PriceKind): PricedCall {
  const k: PriceKind = kind ?? (u.audioSeconds && u.audioSeconds > 0 ? 'speech' : 'chat')
  const r = resolvePrice(book, provider, model, k)
  const p = r.price.kind === k ? r.price : { ...r.price, kind: k }
  const rates: PricedCall['rates'] = {}
  if (p.inputPer1M !== undefined) rates.inputPer1M = p.inputPer1M
  if (p.outputPer1M !== undefined && k === 'chat') rates.outputPer1M = p.outputPer1M
  if (p.cachedInputPer1M !== undefined) rates.cachedInputPer1M = p.cachedInputPer1M
  if (k === 'speech') rates.perMinute = p.perMinute ?? 0
  return { costMicros: costMicros(p, u), unpriced: r.unpriced, free: r.free, rates, matched: r.unpriced ? '' : r.price.match }
}

export const microsToUsd = (micros: number): number => Math.round(Number(micros) || 0) / 1_000_000
export const usdToMicros = (usd: number): number => Math.round((Number(usd) || 0) * 1_000_000)
