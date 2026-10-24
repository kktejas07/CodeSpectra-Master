/**
 * Cross-encoder rerank of the fused head (lib/rag/search runSearch), on the
 * platform keys (lib/ai/get-api-key).
 *
 * Fusion (lib/rag/fusion) decides WHICH chunks are candidates; a cross-encoder
 * reads query + chunk together and decides their ORDER, which is where most of
 * the remaining precision is. Chain: Cohere rerank-v3.5 → Jina reranker v2.
 * Only the top RAG_RERANK_CANDIDATES (default 30) fused rows are sent; the rest
 * keep their fused order after them.
 *
 * Never fails the search: no key, timeout, HTTP error or a malformed response
 * → the fused order is returned unchanged (warning rate-limited per provider).
 * 429 marks the key rate-limited so round-robin moves on, like lib/rag/embed.
 * Neither provider has an env-var key fallback, so the offline eval (in-memory
 * Mongo, no secrets) never reranks and its numbers are unaffected.
 *
 * Env: RAG_RERANK=0 off · RAG_RERANK_CANDIDATES (5–100) · RAG_RERANK_TIMEOUT_MS (200–15000).
 */
import { getApiKey, markRateLimited, trackAiUsage, type ProviderId } from '@/lib/ai/get-api-key'
import { STAFF_ONLY_TYPES, type KnowledgeSourceType } from './types'

export const RERANK_DEFAULTS = { enabled: true, candidates: 30, timeoutMs: 3000 }
/** Per-document cap sent to the provider (~500 tokens: one Cohere "search unit" document). */
export const RERANK_MAX_DOC_CHARS = 2000

export type RerankConfig = typeof RERANK_DEFAULTS

/** Rerank knobs from the environment, clamped; defaults when unset or invalid. Pure given `env`. */
export function rerankConfig(env: Record<string, string | undefined> = process.env): RerankConfig {
  const num = (v: string | undefined, min: number, max: number, def: number) => {
    const n = v === undefined || v.trim() === '' ? NaN : Number(v)
    return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : def
  }
  const flag = (env.RAG_RERANK ?? '').trim().toLowerCase()
  return {
    enabled: !['0', 'false', 'off', 'no'].includes(flag),
    candidates: num(env.RAG_RERANK_CANDIDATES, 5, 100, RERANK_DEFAULTS.candidates),
    timeoutMs: num(env.RAG_RERANK_TIMEOUT_MS, 200, 15_000, RERANK_DEFAULTS.timeoutMs),
  }
}

/** One provider result: `index` into the documents sent, higher score = more relevant. */
export interface RerankResult { index: number; relevance_score: number }

/** Parse a `{ results: [{ index, relevance_score }] }` body; null when it doesn't match `n` documents. Pure. */
export function parseRerankResults(json: unknown, n: number): RerankResult[] | null {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return null
  const seen = new Set<number>()
  const out: RerankResult[] = []
  for (const r of results as { index?: unknown; relevance_score?: unknown }[]) {
    const index = r?.index
    const score = r?.relevance_score
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= n || seen.has(index)) continue
    if (typeof score !== 'number' || !Number.isFinite(score)) continue
    seen.add(index)
    out.push({ index, relevance_score: score })
  }
  return out.length ? out : null
}

/**
 * Pure: `rows` with its first `headSize` rows reordered by `results` (indexes
 * into that head). Scored head rows come first, best score first (ties keep
 * fused order); head rows the provider didn't score follow in fused order, then
 * every row after the head, untouched. Scored rows carry `rerankScore`.
 * No usable result → `rows` unchanged.
 */
export function applyRerank<T extends object>(rows: readonly T[], headSize: number, results: readonly RerankResult[] | null): (T & { rerankScore?: number })[] {
  const n = Math.max(0, Math.min(headSize, rows.length))
  const valid = parseRerankResults({ results }, n)
  if (!valid) return [...rows]
  const scored = [...valid].sort((a, b) => b.relevance_score - a.relevance_score || a.index - b.index)
  const used = new Set(scored.map((r) => r.index))
  return [
    ...scored.map((r) => ({ ...rows[r.index], rerankScore: r.relevance_score })),
    ...rows.slice(0, n).filter((_, i) => !used.has(i)),
    ...rows.slice(n),
  ]
}

type Provider = { id: ProviderId; model: string; url: string; body: (query: string, documents: string[]) => Record<string, unknown> }

// Request / response shapes: Cohere v2 rerank and Jina /v1/rerank both take
// { model, query, documents: string[], top_n } and return results[{ index, relevance_score }].
export const RERANK_PROVIDERS: readonly Provider[] = [
  {
    id: 'cohere',
    model: 'rerank-v3.5',
    url: 'https://api.cohere.com/v2/rerank',
    body: (query, documents) => ({ model: 'rerank-v3.5', query, documents, top_n: documents.length }),
  },
  {
    id: 'jina',
    model: 'jina-reranker-v2-base-multilingual',
    url: 'https://api.jina.ai/v1/rerank',
    body: (query, documents) => ({ model: 'jina-reranker-v2-base-multilingual', query, documents, top_n: documents.length, return_documents: false }),
  },
]

const WARN_EVERY_MS = 5 * 60_000
const warned = new Map<string, { at: number; suppressed: number }>()

/** console.warn at most once per WARN_EVERY_MS per provider, so a dead provider doesn't flood the logs. */
function warnOnce(provider: string, msg: string): void {
  const now = Date.now()
  const w = warned.get(provider)
  if (w && now - w.at < WARN_EVERY_MS) { w.suppressed++; return }
  const extra = w?.suppressed ? ` (${w.suppressed} similar warnings suppressed)` : ''
  warned.set(provider, { at: now, suppressed: 0 })
  console.warn(`[rag/rerank] ${msg} — keeping the fused order${extra}`)
}

/** Test hook: forget rate-limited warnings. */
export function resetRerankWarnings(): void {
  warned.clear()
}

/**
 * Scores for `documents` against `query` from the first provider that has a
 * key and answers within the shared time budget; null when none did.
 */
export async function rerankDocuments(
  query: string,
  documents: string[],
  opts: { userId?: string; timeoutMs?: number; feature?: string } = {},
): Promise<{ provider: ProviderId; model: string; results: RerankResult[] } | null> {
  if (documents.length < 2) return null
  const deadline = Date.now() + (opts.timeoutMs ?? RERANK_DEFAULTS.timeoutMs)
  const docs = documents.map((d) => (d || ' ').slice(0, RERANK_MAX_DOC_CHARS))
  const inputTokens = Math.ceil((query.length * docs.length + docs.reduce((n, d) => n + d.length, 0)) / 4)
  const feature = opts.feature ?? 'rag_rerank'

  for (const p of RERANK_PROVIDERS) {
    const auth = await getApiKey(p.id)
    if (!auth?.key) continue
    const left = deadline - Date.now()
    // ponytail: one shared budget, no retries — a reranker that is slow now is skipped,
    // not waited on. Ceiling: a flaky provider reranks less often; tune RAG_RERANK_TIMEOUT_MS.
    if (left < 100) { warnOnce(p.id, `no time left for ${p.id}`); break }
    const started = Date.now()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), left)
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${auth.key}` },
        body: JSON.stringify(p.body(query, docs)),
        signal: ac.signal,
      })
      if (!res.ok) {
        if (res.status === 429) await markRateLimited(p.id, auth.key, 60_000)
        const body = (await res.text().catch(() => '')).slice(0, 200)
        throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`)
      }
      const results = parseRerankResults(await res.json(), docs.length)
      if (!results) throw new Error('malformed response (no usable results)')
      void trackAiUsage({
        user_id: opts.userId, feature, provider: p.id, model: p.model,
        input_tokens: inputTokens, output_tokens: 0, latency_ms: Date.now() - started, success: true, kind: 'embedding',
      })
      return { provider: p.id, model: p.model, results }
    } catch (e) {
      const msg = ac.signal.aborted ? `timed out after ${left} ms` : (e instanceof Error ? e.message : String(e))
      warnOnce(p.id, `${p.model} via ${p.id} failed: ${msg.slice(0, 300)}`)
      void trackAiUsage({
        user_id: opts.userId, feature, provider: p.id, model: p.model,
        latency_ms: Date.now() - started, success: false, error: msg.slice(0, 200), kind: 'embedding',
      })
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/**
 * Rerank the head of `rows` (fused order) for `query`. `textOf` gives each
 * row's document text (data, not instructions). Returns `rows` unchanged when
 * reranking is off, unconfigured or failed.
 */
/**
 * Candidate data (résumés, applicants, attempts) and question-bank items never go
 * to the rerank provider unless RAG_RERANK_CANDIDATE_DATA=1 (set it once the
 * provider is covered by your DPA): a head containing any of them keeps the fused
 * order. Embedding providers already see this text; a reranker would be one more processor.
 */
export function rerankAllowed(
  types: readonly string[],
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.RAG_RERANK_CANDIDATE_DATA === '1' || !types.some((t) => STAFF_ONLY_TYPES.has(t as KnowledgeSourceType))
}

export async function rerankRows<T extends object>(
  query: string,
  rows: readonly T[],
  textOf: (row: T) => string,
  opts: { userId?: string; config?: RerankConfig; env?: Record<string, string | undefined> } = {},
): Promise<(T & { rerankScore?: number })[]> {
  const cfg = opts.config ?? rerankConfig()
  if (!cfg.enabled || rows.length < 2) return [...rows]
  const head = rows.slice(0, cfg.candidates)
  if (!rerankAllowed(head.map((r) => String((r as { source_type?: unknown }).source_type ?? '')), opts.env)) return [...rows]
  const out = await rerankDocuments(query, head.map(textOf), { userId: opts.userId, timeoutMs: cfg.timeoutMs }).catch(() => null)
  return applyRerank(rows, head.length, out?.results ?? null)
}
