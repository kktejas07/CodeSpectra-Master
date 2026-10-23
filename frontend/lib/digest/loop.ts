/**
 * The digest agents and their loop (pure orchestration; the tools are
 * injected — lib/digest/tools.ts gives the real ones, tests give fakes).
 *
 * Two agents with separate tool sets (an agent can only call its own tools):
 *
 *   Digest curator   list_candidates · get_item · score_items · draft_summary ·
 *                    compose_digest · publish_digest
 *   Digest verifier  get_item · check_duplicate · verify_item
 *
 * Loop: plan (list + score) → select by score within quotas → draft 1–2 line
 * summaries → the verifier checks every new pick (closed deadlines, broken
 * links, duplicates / repeats, invented facts, missing facts) → rejected picks
 * are replaced by the next best (quotas still apply) → repeat until N items
 * are verified or 3 iterations → compose → publish (unless preview).
 *
 * A summary with invented facts / a URL / too long is not a reason to drop
 * the item: its template summary (facts only) replaces it.
 */
import { selectDigest } from './rank'
import type { DigestSettings } from './settings'
import { templateSummary } from './templates'
import type { DigestCandidate, DigestItem, DigestLocale, DigestSummary, ScoredCandidate, TraceStep, VerifyResult } from './types'

export type AgentName = 'curator' | 'verifier'

export const DIGEST_AGENTS: Record<AgentName, { label: string; role: string; tools: readonly string[] }> = {
  curator: {
    label: 'Digest curator',
    role: 'Picks the best open events, news, Learn posts and contests for today by score within category quotas, drafts 1–2 line summaries strictly from each item’s own data, composes and publishes the digest.',
    tools: ['list_candidates', 'get_item', 'score_items', 'draft_summary', 'compose_digest', 'publish_digest'],
  },
  verifier: {
    label: 'Digest verifier',
    role: 'Independently re-reads every pick and rejects closed or past deadlines, broken links, duplicates and recent repeats, missing facts and summaries with facts the item does not contain.',
    tools: ['get_item', 'check_duplicate', 'verify_item'],
  },
}

export type Summaries = Partial<Record<DigestLocale, DigestSummary>>

export interface DraftOutcome {
  summaries: Map<string, Summaries>
  /** Model calls made (0 = templates only). */
  ai_calls: number
  /** Why the model was not used, if it wasn't. */
  fallback: string | null
}

export interface LoopTools {
  list_candidates(): Promise<DigestCandidate[]>
  score_items(c: readonly DigestCandidate[]): ScoredCandidate[]
  draft_summary(items: readonly ScoredCandidate[], langs: readonly DigestLocale[]): Promise<DraftOutcome>
  /** Verifier: gathers its own evidence (get_item, link check, check_duplicate) and applies the rules. */
  verify_item(item: ScoredCandidate, summaries: Summaries, verified: readonly ScoredCandidate[]): Promise<VerifyResult>
}

export interface LoopOptions {
  settings: Pick<DigestSettings, 'n' | 'quotas' | 'max_per_category' | 'max_per_source'>
  n: number
  langs: readonly DigestLocale[]
  maxIterations?: number
  now?: () => Date
}

export interface LoopResult {
  items: DigestItem[]
  candidates: number
  selected: number
  iterations: number
  rejected: { key: string; reasons: string[] }[]
  summary_fixes: number
  ai_calls: number
  fallback: string | null
  trace: TraceStep[]
}

export const MAX_ITERATIONS = 3

/** Guard: an agent may only call the tools it owns. */
export function assertAgentTool(agent: AgentName, tool: string): void {
  if (!DIGEST_AGENTS[agent].tools.includes(tool)) throw new Error(`${DIGEST_AGENTS[agent].label} cannot use ${tool}`)
}

export async function runCuratorLoop(tools: LoopTools, opts: LoopOptions): Promise<LoopResult> {
  const clock = opts.now ?? (() => new Date())
  const trace: TraceStep[] = []
  const step = <T>(agent: AgentName | 'system', tool: string, note: string, v: T): T => {
    if (agent !== 'system') assertAgentTool(agent, tool)
    trace.push({ agent, tool, note: note.slice(0, 300), at: clock().toISOString() })
    return v
  }
  const maxIt = Math.max(1, Math.min(MAX_ITERATIONS, opts.maxIterations ?? MAX_ITERATIONS))

  // ── plan ──
  const cands = await tools.list_candidates()
  step('curator', 'list_candidates', `${cands.length} candidates`, null)
  const scored = tools.score_items(cands)
  step('curator', 'score_items', `${scored.length} open candidates scored`, null)

  const rejected = new Map<string, string[]>()
  const verified: ScoredCandidate[] = []
  const summaries = new Map<string, Summaries>()
  let selected = 0
  let iterations = 0
  let aiCalls = 0
  let fallback: string | null = null
  let fixes = 0

  while (iterations < maxIt && verified.length < opts.n) {
    iterations++
    // ── select (replacements come from the next best, quotas still apply) ──
    const sel = selectDigest(scored, opts.settings, { exclude: new Set(rejected.keys()), keep: verified, n: opts.n })
    const fresh = sel.items.filter((c) => !verified.some((v) => v.key === c.key))
    step('curator', 'score_items', `iteration ${iterations}: ${fresh.length} new picks, ${sel.duplicates.length} near-duplicates skipped`, null)
    if (!fresh.length) break
    selected += fresh.length

    // ── draft ──
    const drafts = await tools.draft_summary(fresh, opts.langs)
    aiCalls += drafts.ai_calls
    if (drafts.fallback) fallback = drafts.fallback
    step('curator', 'draft_summary', `${drafts.summaries.size} drafted, ${drafts.ai_calls} model call(s)${drafts.fallback ? `, template text (${drafts.fallback})` : ''}`, null)

    // ── verify (separate agent) ──
    for (const item of fresh) {
      const s: Summaries = { ...(drafts.summaries.get(item.key) || {}) }
      const res = await tools.verify_item(item, s, verified)
      step('verifier', 'verify_item', `${item.key}: ${res.ok ? 'ok' : res.reasons.join(',')}`, null)
      if (!res.ok) {
        rejected.set(item.key, res.reasons)
        continue
      }
      for (const [lang, issues] of Object.entries(res.summary_issues) as [DigestLocale, string[]][]) {
        if (!issues?.length) continue
        s[lang] = { text: templateSummary(item, lang), ai: false }
        fixes++
      }
      for (const l of opts.langs) if (!s[l]?.text) s[l] = { text: templateSummary(item, l), ai: false }
      summaries.set(item.key, s)
      verified.push(item)
      if (verified.length >= opts.n) break
    }
  }

  const order = new Map(scored.map((c, i) => [c.key, i]))
  const items: DigestItem[] = verified
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
    .slice(0, opts.n)
    .map((c, i) => ({ ...c, rank: i + 1, summaries: summaries.get(c.key) || {} }))
  step('system', 'loop_done', `${items.length}/${opts.n} verified after ${iterations} iteration(s), ${rejected.size} rejected`, null)
  return {
    items,
    candidates: cands.length,
    selected,
    iterations,
    rejected: [...rejected.entries()].map(([key, reasons]) => ({ key, reasons })),
    summary_fixes: fixes,
    ai_calls: aiCalls,
    fallback,
    trace,
  }
}

/**
 * Deterministic fallback (no AI, no network): pure ranking + quotas + template
 * text. Used when the agent loop itself fails, so the digest still goes out.
 */
export function fallbackDigestItems(scored: readonly ScoredCandidate[], opts: Pick<LoopOptions, 'settings' | 'n' | 'langs'>): DigestItem[] {
  const sel = selectDigest(scored, opts.settings, { n: opts.n })
  return sel.items.map((c, i) => ({
    ...c,
    rank: i + 1,
    summaries: Object.fromEntries(opts.langs.map((l) => [l, { text: templateSummary(c, l), ai: false }])) as Summaries,
  }))
}
