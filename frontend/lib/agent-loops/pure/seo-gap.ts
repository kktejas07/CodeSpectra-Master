/**
 * SEO / content gap loop — pure logic (client-safe, tested).
 *
 * Inputs: what people search for (the public "Ask" box, logged privacy-safe as
 * normalised query text with counts — no user, IP or session; plus queries an
 * admin pastes from a Google Search Console export) and what we already cover
 * (Learn topics, published Learn posts and their hi / te translations).
 * Output: gaps — a new Learn topic for a query nothing covers, or a
 * translation when an English post covers a Hindi / Telugu query.
 */
import type { LearnCategoryId } from '@/lib/learn/types'

export type QueryLocale = 'en' | 'hi' | 'te'

/**
 * Normalise a search query for storage, or null when it should not be kept:
 * lower case, no URLs / emails / phone or long numbers (personal data), no
 * punctuation, max 100 chars, at least 3 letters.
 */
export function normalizeQuery(raw: unknown): string | null {
  let s = String(raw ?? '').normalize('NFC').toLowerCase()
  if (/@|\bhttps?:|www\./.test(s)) s = s.replace(/\S*@\S+|https?:\/\/\S+|www\.\S+/g, ' ')
  s = s.replace(/\+?\d[\d\s-]{6,}\d/g, ' ').replace(/\d{5,}/g, ' ')
  s = s.replace(/[^\p{L}\p{M}\p{N}\s+#.]/gu, ' ').replace(/(^|\s)[.#+]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100).trim()
  const letters = s.replace(/[^\p{L}]/gu, '').length
  return letters >= 3 ? s : null
}

export function queryLocale(q: string): QueryLocale {
  if (/[ఀ-౿]/.test(q)) return 'te'
  if (/[ऀ-ॿ]/.test(q)) return 'hi'
  return 'en'
}

const STOP = new Set(['a', 'an', 'the', 'is', 'are', 'what', 'how', 'to', 'in', 'of', 'for', 'and', 'or', 'with', 'do', 'does', 'i', 'my', 'me', 'can', 'on', 'vs', 'versus', 'which', 'why', 'when', 'best', 'use', 'using', 'learn', 'about', 'explain', 'example', 'examples', 'tutorial', 'guide', 'kya', 'hai', 'kaise', 'kare', 'ka', 'ki', 'ke', 'se', 'mein',
  // Hindi / Telugu question and filler words (tech terms are usually typed in English).
  'में', 'क्या', 'है', 'हैं', 'कैसे', 'का', 'की', 'के', 'से', 'और', 'हिंदी', 'सीखें', 'ఏమిటి', 'ఎలా', 'అంటే', 'లో', 'తెలుగులో', 'తెలుగు', 'నేర్చుకోండి'])

export function queryTokens(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/[\s/,-]+/).map((w) => w.replace(/^[.]+|[.]+$/g, '')).filter((w) => w.length >= 2 && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))]
}

export interface CoverageDoc { id: string; title: string; tags?: string[]; slug?: string; locales?: QueryLocale[] }

/** Share of the query's tokens that appear in the doc's title or tags (0..1). */
export function coverageScore(tokens: readonly string[], doc: CoverageDoc): number {
  if (!tokens.length) return 0
  const docTokens = new Set(queryTokens([doc.title, ...(doc.tags || [])].join(' ')))
  const hit = tokens.filter((t) => docTokens.has(t) || [...docTokens].some((d) => d.length > 4 && t.length > 4 && (d.startsWith(t) || t.startsWith(d)))).length
  return hit / tokens.length
}

export interface QueryStat { key: string; q: string; count: number; locale: QueryLocale; zero_hits?: number }

export type Gap =
  | { kind: 'new_topic'; key: string; q: string; count: number; locale: QueryLocale; queries: string[]; title: string; category: LearnCategoryId }
  | { kind: 'translate'; key: string; q: string; count: number; locale: 'hi' | 'te'; post_id: string; post_title: string }

const CATEGORY_WORDS: [LearnCategoryId, RegExp][] = [
  ['dsa', /\b(array|string|tree|graph|heap|stack|queue|linked|sort|sorting|search|binary|dp|dynamic programming|recursion|hash|trie|greedy|backtracking|algorithm|complexity|big o|bfs|dfs|dijkstra)\b/],
  ['system-design', /\b(system design|scalab|load balanc|caching|cache|sharding|microservice|rate limit|cdn|message queue|kafka|distributed)\b/],
  ['databases', /\b(sql|mysql|postgres|mongodb|database|index|join|normali[sz]ation|nosql|redis|query)\b/],
  ['cloud', /\b(aws|azure|gcp|docker|kubernetes|k8s|devops|ci\/?cd|terraform|cloud|linux|serverless)\b/],
  ['security', /\b(security|xss|csrf|sql injection|oauth|jwt|encryption|owasp|hashing password|ctf)\b/],
  ['ai-ml', /\b(machine learning|ml|ai|llm|neural|deep learning|transformer|rag|embedding|prompt|nlp|pandas|numpy)\b/],
  ['testing', /\b(test|testing|unit test|jest|pytest|selenium|tdd)\b/],
  ['interview-prep', /\b(interview|placement|aptitude|coding round|leetcode|hr round|tcs|infosys|wipro|accenture|amazon|google)\b/],
  ['career', /\b(resume|cv|career|job|internship|salary|linkedin|portfolio|fresher)\b/],
  ['design-patterns', /\b(design pattern|singleton|factory|observer|solid|dependency injection)\b/],
  ['languages', /\b(python|java|javascript|typescript|c\+\+|cpp|golang|go|rust|kotlin|c#)\b/],
]

export function guessCategory(q: string): LearnCategoryId {
  const s = q.toLowerCase()
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(s)) return cat
  return 'technologies'
}

/** A topic title from a query: question words dropped, first letter capitalised. */
export function topicTitleFromQuery(q: string): string {
  const t = q.replace(/^(what is|what are|how to|how do i|how does|why is|explain|difference between)\s+/i, '').replace(/\?+$/, '').trim()
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 120)
}

/** Group near-duplicate queries (≥ 60% shared tokens) under the most-asked one. */
export function clusterQueries(stats: readonly QueryStat[]): { lead: QueryStat; members: QueryStat[]; count: number }[] {
  const sorted = [...stats].sort((a, b) => b.count - a.count || a.q.localeCompare(b.q))
  const clusters: { lead: QueryStat; tokens: string[]; members: QueryStat[]; count: number }[] = []
  for (const s of sorted) {
    const tk = queryTokens(s.q)
    if (!tk.length) continue
    const home = clusters.find((c) => c.lead.locale === s.locale && overlap(c.tokens, tk) >= 0.6)
    if (home) { home.members.push(s); home.count += s.count }
    else clusters.push({ lead: s, tokens: tk, members: [s], count: s.count })
  }
  return clusters.map(({ lead, members, count }) => ({ lead, members, count }))
}

function overlap(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a)
  const shared = b.filter((x) => A.has(x)).length
  return shared / Math.max(a.length, b.length)
}

/**
 * Gaps, most-asked first. A cluster is covered when a topic or post scores
 * ≥ `threshold`. A Hindi / Telugu query covered only by an English post that
 * has no translation in that language becomes a translation gap.
 */
export function findGaps(
  stats: readonly QueryStat[],
  cover: { topics: readonly CoverageDoc[]; posts: readonly CoverageDoc[] },
  opts: { minCount?: number; threshold?: number; max?: number } = {},
): Gap[] {
  const minCount = opts.minCount ?? 2
  const threshold = opts.threshold ?? 0.6
  const out: Gap[] = []
  for (const c of clusterQueries(stats)) {
    if (c.count < minCount) continue
    const tk = queryTokens(c.lead.q)
    const best = (docs: readonly CoverageDoc[]) => docs.reduce<{ doc: CoverageDoc | null; score: number }>((acc, d) => {
      const s = coverageScore(tk, d)
      return s > acc.score ? { doc: d, score: s } : acc
    }, { doc: null, score: 0 })
    const post = best(cover.posts)
    const topic = best(cover.topics)
    const loc = c.lead.locale
    if (post.score >= threshold && post.doc) {
      if (loc !== 'en' && !(post.doc.locales || []).includes(loc)) out.push({ kind: 'translate', key: `translate:${post.doc.id}:${loc}`, q: c.lead.q, count: c.count, locale: loc, post_id: post.doc.id, post_title: post.doc.title })
      continue
    }
    if (topic.score >= threshold) continue
    out.push({ kind: 'new_topic', key: `topic:${c.lead.key}`, q: c.lead.q, count: c.count, locale: loc, queries: c.members.slice(0, 5).map((m) => m.q), title: topicTitleFromQuery(c.lead.q), category: guessCategory(c.lead.q) })
  }
  return out.sort((a, b) => b.count - a.count).slice(0, opts.max ?? 20)
}

/**
 * Queries from a Google Search Console "Queries" export (CSV): the first
 * column whose header contains "quer", with Impressions when present.
 * Max 2000 rows; unusable rows are dropped.
 */
export function parseSearchConsoleCsv(text: string): { q: string; impressions: number }[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []
  const split = (l: string) => {
    const cells: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]
      if (ch === '"') { if (quoted && l[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted }
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    return cells.map((c) => c.trim())
  }
  const head = split(lines[0]).map((h) => h.toLowerCase())
  const qi = head.findIndex((h) => h.includes('quer'))
  const ii = head.findIndex((h) => h.includes('impression'))
  if (qi < 0) return []
  const out: { q: string; impressions: number }[] = []
  for (const l of lines.slice(1, 2001)) {
    const c = split(l)
    const q = c[qi]
    if (!q) continue
    const imp = ii >= 0 ? Number(String(c[ii]).replace(/[^\d.]/g, '')) : 1
    out.push({ q, impressions: Number.isFinite(imp) && imp > 0 ? Math.round(imp) : 1 })
  }
  return out
}
