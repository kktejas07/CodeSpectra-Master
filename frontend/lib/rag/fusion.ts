/**
 * Ranking helpers for hybrid search (pure): reciprocal rank fusion, cosine
 * similarity, per-source dedupe and highlighted snippets.
 */

export const RRF_K = 60

export interface RankedId {
  id: string
}

/**
 * Reciprocal rank fusion: score(d) = Σ_lists 1 / (k + rank_d), rank from 1.
 * Ties keep the order of first appearance (vector list first).
 */
export function reciprocalRankFusion(lists: ReadonlyArray<ReadonlyArray<string>>, k = RRF_K): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  const order: string[] = []
  for (const list of lists) {
    const seen = new Set<string>()
    list.forEach((id, i) => {
      if (seen.has(id)) return // a list counts each id once (its best rank)
      seen.add(id)
      if (!scores.has(id)) order.push(id)
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1))
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
