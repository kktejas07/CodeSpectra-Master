/**
 * Copilot cost metering (AGT-001 / AGT-002). Pure — no DB.
 *
 * Every model call in a turn (the chat steps, the rolling-summary call and any
 * AI generation inside a tool's propose()) is recorded as a UsageEntry with its
 * real input/output tokens. A turn is charged for what it actually used,
 * whatever its status (ok, max steps, budget stop, aborted, error):
 *
 *   cost_usd = Σ (input × price.in + output × price.out) / 1M   (price table)
 *   credits  = max( ceil(tokens / tokens_per_credit), ceil(cost_usd / usd_per_credit) )
 *              — at least 1 when any tokens were used, 0 when none were.
 *
 * Free / unknown models still cost tokens (the token term), so a free model
 * can't be used to drain the platform; expensive models cost more credits.
 */
import { AI_COST_RATES } from '@/lib/db/analytics'

export interface UsageEntry {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  /** chat | summary | generation | subagent */
  kind?: 'chat' | 'summary' | 'generation' | 'subagent'
}

export interface MeterConfig {
  tokensPerCredit: number
  usdPerCredit: number
}

export const DEFAULT_METER: MeterConfig = { tokensPerCredit: 20_000, usdPerCredit: 0.005 }

/** Models served free by their provider (still metered by tokens). */
const FREE_MODEL_RE = /(:free\b|-free\b|\bfree$)/i

export function priceFor(model: string): { input: number; output: number } {
  const m = (model || '').toLowerCase()
  if (FREE_MODEL_RE.test(m)) return { input: 0, output: 0 }
  // Longest matching key wins ("gpt-4o-mini" before "gpt-4o").
  const key = Object.keys(AI_COST_RATES).filter((k) => m.includes(k)).sort((a, b) => b.length - a.length)[0]
  // Unknown model: price it like a mid-range model rather than free.
  return key ? AI_COST_RATES[key] : { input: 1.0, output: 4.0 }
}

export function costUsd(entries: readonly UsageEntry[]): number {
  let usd = 0
  for (const e of entries) {
    const p = priceFor(e.model)
    usd += (Math.max(0, e.inputTokens) * p.input + Math.max(0, e.outputTokens) * p.output) / 1_000_000
  }
  return Math.round(usd * 1e6) / 1e6
}

export function totalTokens(entries: readonly UsageEntry[]): { input: number; output: number; total: number } {
  let input = 0
  let output = 0
  for (const e of entries) {
    input += Math.max(0, Math.floor(e.inputTokens || 0))
    output += Math.max(0, Math.floor(e.outputTokens || 0))
  }
  return { input, output, total: input + output }
}

export function creditsForUsage(entries: readonly UsageEntry[], cfg: MeterConfig = DEFAULT_METER): number {
  const { total } = totalTokens(entries)
  if (total <= 0) return 0
  const byTokens = Math.ceil(total / Math.max(1, cfg.tokensPerCredit))
  const byCost = cfg.usdPerCredit > 0 ? Math.ceil(costUsd(entries) / cfg.usdPerCredit) : 0
  return Math.max(1, byTokens, byCost)
}

export interface TurnCharge {
  inputTokens: number
  outputTokens: number
  costUsd: number
  credits: number
  byKind: Record<string, number>
  models: string[]
}

export function chargeFor(entries: readonly UsageEntry[], cfg: MeterConfig = DEFAULT_METER): TurnCharge {
  const t = totalTokens(entries)
  const byKind: Record<string, number> = {}
  for (const e of entries) byKind[e.kind ?? 'chat'] = (byKind[e.kind ?? 'chat'] ?? 0) + e.inputTokens + e.outputTokens
  return {
    inputTokens: t.input,
    outputTokens: t.output,
    costUsd: costUsd(entries),
    credits: creditsForUsage(entries, cfg),
    byKind,
    models: [...new Set(entries.map((e) => `${e.provider}/${e.model}`))].slice(0, 10),
  }
}

/** Human pricing line for the status badge. */
export function pricingText(cfg: MeterConfig = DEFAULT_METER): string {
  return `Each message is charged for the AI it actually uses: 1 credit per ${cfg.tokensPerCredit.toLocaleString('en-US')} tokens (or per $${cfg.usdPerCredit} of model cost on paid models, whichever is more), at least 1 credit. Drafts that generate questions or problems include that AI work. Stopped or failed messages pay only for what ran.`
}
