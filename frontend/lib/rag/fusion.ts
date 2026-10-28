/**
 * Ranking helpers for hybrid search (pure): reciprocal rank fusion, cosine
 * similarity, per-source dedupe and highlighted snippets.
 */

export const RRF_K = 60

/**
 * RAG-020: keyword-first fusion. Weighted RRF with k 1 and keyword weight 10
 * keeps the keyword order for the top 3 (a vector bonus of at most 1/2 can't
 * bridge the keyword gap 10/((1+r)(2+r)) until rank 4), lets the vector list
 * reorder ranks 4+, and rescues vector-only hits at about keyword rank 19 —
 * so hybrid is never worse than keyword-only at top 3 / 5 and still finds
 * pure paraphrases further down. Offline golden set (2026-10-23, 144 questions,
 * keyword-only s@3 0.893, s@5 0.934, multi-hop s@3 0.833, MRR 0.818):
 *   k 10 / kw 1.5 (previous)    s@3 0.877  s@5 0.918  multi-hop 0.667  MRR 0.835
 *   k 60 / kw 10                s@3 0.877  s@5 0.926  multi-hop 0.833  MRR 0.825
 *   source-level RRF, k 60 1:1  s@3 0.869  s@5 0.902  multi-hop 0.667  MRR 0.844
 *   convex score fusion α 0.7   s@3 0.885  s@5 0.918  multi-hop 0.833  MRR 0.855
 *   k 1 / kw 10 (this)          s@3 0.893  s@5 0.934  multi-hop 0.833  MRR 0.820, s@10 0.959 (kw 0.951)
 * Every vector-led reordering of the top ranks cost more keyword hits than it
 * won, so keyword-first is what the data supports. The local embedder is only a
 * proxy: confirm with the weekly live eval on the real embedder.
 * Ops can override with RAG_RRF_K / RAG_RRF_VECTOR_WEIGHT / RAG_RRF_KEYWORD_WEIGHT.
 */
export const FUSION_DEFAULTS = { k: 1, vector: 1, keyword: 10 }

/** Fusion knobs from the environment, clamped; defaults when unset or invalid. Pure given `env`. */
export function fusionConfig(env: Record<string, string | undefined> = process.env): { k: number; vector: number; keyword: number } {
  const num = (v: string | undefined, min: number, max: number, def: number) => {
    const n = v === undefined || v.trim() === '' ? NaN : Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  return {
    k: num(env.RAG_RRF_K, 1, 1000, FUSION_DEFAULTS.k),
    vector: num(env.RAG_RRF_VECTOR_WEIGHT, 0, 10, FUSION_DEFAULTS.vector),
    keyword: num(env.RAG_RRF_KEYWORD_WEIGHT, 0, 10, FUSION_DEFAULTS.keyword),
  }
}

/**
 * RAG-025: vector-confidence rescue. Keyword-first fusion buries a pure
 * paraphrase (a question that shares no words with its answer) at about
 * keyword rank 19. When the vector list is *confident* — its top hit has a
 * high cosine and clearly beats the runner-up — and the keyword list ranks
 * that hit poorly (or not at all), the hit is moved up to `position`. One hit
 * at most, never above the keyword top `position - 1`, so keyword-led answers
 * keep their place. Tune per embedder with RAG_VECTOR_RESCUE_MIN /
 * RAG_VECTOR_RESCUE_MARGIN / RAG_VECTOR_RESCUE_POSITION (MIN 0 or > 1 = off).
 */
export const VECTOR_RESCUE_DEFAULTS = { minScore: 0.5, margin: 0.05, position: 3, keywordRankBelow: 5 }

export function vectorRescueConfig(env: Record<string, string | undefined> = process.env): typeof VECTOR_RESCUE_DEFAULTS {
  const num = (v: string | undefined, min: number, max: number, def: number) => {
    const n = v === undefined || v.trim() === '' ? NaN : Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  return {
    minScore: num(env.RAG_VECTOR_RESCUE_MIN, 0, 2, VECTOR_RESCUE_DEFAULTS.minScore),
    margin: num(env.RAG_VECTOR_RESCUE_MARGIN, 0, 1, VECTOR_RESCUE_DEFAULTS.margin),
    position: Math.round(num(env.RAG_VECTOR_RESCUE_POSITION, 1, 20, VECTOR_RESCUE_DEFAULTS.position)),
    keywordRankBelow: Math.round(num(env.RAG_VECTOR_RESCUE_KEYWORD_RANK, 1, 100, VECTOR_RESCUE_DEFAULTS.keywordRankBelow)),
  }
}

/** Pure: `fused` with the confident vector top hit moved up to `position` (1-based) when the rule applies. */
export function vectorRescue<T extends { id: string }>(
  fused: readonly T[],
  vector: ReadonlyArray<{ id: string; score: number }>,
  keywordIds: readonly string[],
  cfg: typeof VECTOR_RESCUE_DEFAULTS = VECTOR_RESCUE_DEFAULTS,
): T[] {
  const out = [...fused]
  // Best and runner-up by score (vector lists are normally sorted, but don't rely on it).
  let top: { id: string; score: number } | undefined
  let second = 0
  for (const v of vector) {
    if (!top || v.score > top.score) { if (top) second = Math.max(second, top.score); top = v }
    else second = Math.max(second, v.score)
  }
  if (!top || !(cfg.minScore > 0) || cfg.minScore > 1) return out
  if (top.score < cfg.minScore || top.score - second < cfg.margin) return out
  const kwRank = keywordIds.indexOf(top.id) // 0-based; -1 = keyword never saw it
  if (kwRank !== -1 && kwRank + 1 < cfg.keywordRankBelow) return out
  const at = out.findIndex((f) => f.id === top.id)
  const target = Math.max(0, cfg.position - 1)
  if (at <= target) return out
  const [hit] = out.splice(at, 1)
  out.splice(target, 0, hit)
  return out
}

export interface RankedId {
  id: string
}

/**
 * Reciprocal rank fusion: score(d) = Σ_lists w_list / (k + rank_d), rank from 1
 * (weights default to 1). Ties keep the order of first appearance (vector list first).
 */
export function reciprocalRankFusion(lists: ReadonlyArray<ReadonlyArray<string>>, k = RRF_K, weights?: readonly number[]): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  const order: string[] = []
  for (const [li, list] of lists.entries()) {
    const w = weights?.[li] ?? 1
    const seen = new Set<string>()
    list.forEach((id, i) => {
      if (seen.has(id)) return // a list counts each id once (its best rank)
      seen.add(id)
      if (!scores.has(id)) order.push(id)
      scores.set(id, (scores.get(id) ?? 0) + w / (k + i + 1))
    })
  }
  return order
    .map((id, i) => ({ id, score: scores.get(id) ?? 0, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ id, score }) => ({ id, score }))
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

/** Keep the best-ranked item per source (input already sorted best first). */
export function dedupeBySource<T extends { source_type: string; source_id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const key = `${it.source_type}:${it.source_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'what', 'how', 'with', 'by', 'at', 'be', 'it', 'this', 'that', 'do', 'does', 'we', 'our', 'my', 'me', 'i'])

/** Lower-cased query terms worth highlighting (≥ 2 chars, no stop words). */
export function queryTerms(query: string): string[] {
  const terms = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu) ?? []
  return [...new Set(terms.map((t) => t.replace(/[.-]+$/, '')).filter((t) => t.length >= 2 && !STOP.has(t)))].slice(0, 12)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * ~`len`-char window around the densest cluster of query terms, with matches
 * wrapped in **bold** (markdown; the UI renders it without HTML).
 */
export function highlightSnippet(text: string, query: string, len = 280): string {
  const clean = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const terms = queryTerms(query)
  if (!clean) return ''
  let start = 0
  if (terms.length) {
    const re = new RegExp(terms.map(escapeRe).join('|'), 'gi')
    const hits: number[] = []
    for (let m = re.exec(clean); m && hits.length < 200; m = re.exec(clean)) hits.push(m.index)
    if (hits.length) {
      // Window start that covers the most hits.
      let best = hits[0], bestCount = 0
      for (let i = 0, j = 0; i < hits.length; i++) {
        while (j < hits.length && hits[j] - hits[i] < len * 0.8) j++
        if (j - i > bestCount) { bestCount = j - i; best = hits[i] }
      }
      start = Math.max(0, best - Math.floor(len * 0.2))
    }
  }
  if (start > 0) {
    const sp = clean.indexOf(' ', start)
    if (sp > 0 && sp - start < 20) start = sp + 1
  }
  let snip = clean.slice(start, start + len)
  if (start + len < clean.length) {
    const sp = snip.lastIndexOf(' ')
    if (sp > len * 0.7) snip = snip.slice(0, sp)
  }
  if (terms.length) {
    const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi')
    snip = snip.replace(re, '**$1**')
  }
  return `${start > 0 ? '…' : ''}${snip}${start + len < clean.length ? '…' : ''}`
}
