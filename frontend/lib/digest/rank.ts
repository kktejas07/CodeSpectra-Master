/**
 * Digest ranking + selection (pure, no I/O; unit-tested in tests/daily-digest.test.ts).
 *
 *   scoreCandidate(c, weights, now)   → { score 0–1, parts }
 *   isOpen(c, now)                     → false once registration / the event is over
 *   isNearDuplicate(a, b)              → same page / source link, or near-identical titles
 *   selectDigest(scored, settings, …)  → top N by score within group quotas,
 *                                        per-category + per-source caps, no near-duplicates
 *
 * Every feature is normalised to 0–1 and the score is the weighted mean, so
 * admins can tune the weights (Admin → Daily digest) without rescaling.
 */
import { canonicalUrl } from '@/lib/events-feed/normalize'
import { titleSimilarity } from '@/lib/events-feed/dedupe'
import type { DigestSettings, RankWeights } from './settings'
import { DIGEST_GROUPS, type DigestCandidate, type DigestCategory, type DigestGroup, type ScoreParts, type ScoredCandidate } from './types'

const HOUR = 3600_000
const DAY = 24 * HOUR
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** Registration still open / event not over (items without dates count as open). Pure. */
export function isOpen(c: Pick<DigestCandidate, 'deadline' | 'ends_at' | 'starts_at' | 'group'>, now: Date): boolean {
  const n = now.getTime()
  if (c.deadline && t(c.deadline) < n) return false
  if (c.ends_at && t(c.ends_at) < n) return false
  // A dated event with no end that started over a day ago is over for a digest.
  if (!c.ends_at && !c.deadline && c.starts_at && (c.group === 'events' || c.group === 'contests') && t(c.starts_at) < n - DAY) return false
  return true
}

/** Base relevance to CodeSpectra's audience (students / early career, India + global). */
const CATEGORY_RELEVANCE: Record<DigestCategory, number> = {
  hackathon: 0.95, contest: 0.9, codeathon: 0.85, ctf: 0.75, datathon: 0.75, conference: 0.55, news: 0.6, learn: 0.8, platform: 0.9,
}
const NEWS_TOPIC_RELEVANCE: Record<string, number> = { 'india-careers': 0.95, ai: 0.85, languages: 0.75, 'dev-tools': 0.75, cloud: 0.7, security: 0.7, industry: 0.6 }

export function scoreParts(c: DigestCandidate, now: Date): ScoreParts {
  const n = now.getTime()
  // Freshness: half-life of 2 days from when it went live / we first saw it.
  const ageH = Math.max(0, (n - (t(c.published_at) || n)) / HOUR)
  const freshness = Math.pow(0.5, ageH / 48)
  // Deadline proximity: open registrations closing soon first (14-day horizon).
  // Dated events without a deadline use their start; undated items are neutral-low.
  const due = t(c.deadline) || t(c.starts_at)
  let deadline = 0
  if (Number.isFinite(due)) {
    const days = (due - n) / DAY
    deadline = days < 0 ? 0 : clamp01(1 - days / 14) * 0.8 + 0.2
  }
  // Prize / size: log scale on USD (US$100k ≈ 1); a prize line without an amount = 0.4.
  const usd = (c.prize_usd_minor || 0) / 100
  const prize = usd > 0 ? clamp01(Math.log10(1 + usd) / 5) : c.prize_text ? 0.4 : 0
  const regionFactor = c.region === 'india' ? 1 : c.region === 'global' ? 0.9 : 0.45
  const base = c.category === 'news' ? (NEWS_TOPIC_RELEVANCE[c.topic || ''] ?? 0.6) : CATEGORY_RELEVANCE[c.category]
  const relevance = clamp01(base * regionFactor + (c.student_friendly ? 0.1 : 0))
  const e = c.engagement || { views: 0, saves: 0, clicks: 0 }
  const engagement = clamp01(Math.log1p(e.views + 3 * e.saves + 2 * e.clicks) / Math.log1p(500))
  const language = clamp01((c.languages?.length || 1) / 3)
  return { freshness, deadline, prize, trust: clamp01(c.trust), relevance, engagement, language }
}

export function scoreCandidate(c: DigestCandidate, w: RankWeights, now: Date): { score: number; parts: ScoreParts } {
  const parts = scoreParts(c, now)
  let sum = 0
  let total = 0
  for (const k of Object.keys(parts) as (keyof ScoreParts)[]) {
    const wk = Math.max(0, w[k] ?? 0)
    sum += wk * parts[k]
    total += wk
  }
  return { score: total > 0 ? Math.round((sum / total) * 10_000) / 10_000 : 0, parts }
}

/** Score + sort (best first; ties: earlier deadline, then newer). Closed items are dropped. Pure. */
export function scoreAll(cands: readonly DigestCandidate[], w: RankWeights, now: Date): ScoredCandidate[] {
  return cands
    .filter((c) => isOpen(c, now))
    .map((c) => ({ ...c, ...scoreCandidate(c, w, now) }))
    .sort((a, b) => b.score - a.score || (t(a.deadline) || Infinity) - (t(b.deadline) || Infinity) || t(b.published_at) - t(a.published_at) || a.key.localeCompare(b.key))
}

const OWN_SOURCES = new Set(['codespectra', 'learn', 'team', 'internal'])

const pageKey = (u: string | null) => (u ? canonicalUrl(u) : '')

/** Same page, same source link, or near-identical titles (events: starts within a day). Pure. */
export function isNearDuplicate(a: Pick<DigestCandidate, 'key' | 'url' | 'source_url' | 'title' | 'starts_at'>, b: Pick<DigestCandidate, 'key' | 'url' | 'source_url' | 'title' | 'starts_at'>): boolean {
  if (a.key === b.key) return true
  if (pageKey(a.url) === pageKey(b.url)) return true
  if (a.source_url && b.source_url && pageKey(a.source_url) === pageKey(b.source_url)) return true
  const sim = titleSimilarity(a.title, b.title)
  if (a.starts_at && b.starts_at) return sim >= 0.8 && Math.abs(t(a.starts_at) - t(b.starts_at)) <= DAY
  return sim >= 0.85
}

export interface SelectOptions {
  /** Keys that must not be picked (rejected by the verifier). */
  exclude?: ReadonlySet<string>
  /** Already verified items: kept first, count against quotas and caps. */
  keep?: readonly ScoredCandidate[]
  /** Override settings.n (bootstrap / admin preview). */
  n?: number
}

export interface Selection {
  items: ScoredCandidate[]
  /** Candidates skipped as near-duplicates of a picked item (key → picked key). */
  duplicates: { key: string; of: string }[]
  /** Items over their group quota that filled empty slots. */
  spill: number
}

/**
 * Top N with diversity (pure):
 *  1. walk the scored list best first; take an item if its group is under
 *     quota, its category and source are under their caps, and it is not a
 *     near-duplicate of anything picked;
 *  2. if quotas leave slots empty (e.g. a quiet news day), fill them with the
 *     next best leftovers (caps and dedupe still apply).
 */
export function selectDigest(scored: readonly ScoredCandidate[], s: Pick<DigestSettings, 'n' | 'quotas' | 'max_per_category' | 'max_per_source'>, opts: SelectOptions = {}): Selection {
  const n = Math.max(1, Math.floor(opts.n ?? s.n))
  const exclude = opts.exclude ?? new Set<string>()
  const picked: ScoredCandidate[] = []
  const duplicates: Selection['duplicates'] = []
  const perGroup = Object.fromEntries(DIGEST_GROUPS.map((g) => [g, 0])) as Record<DigestGroup, number>
  const perCat = new Map<string, number>()
  const perSource = new Map<string, number>()
  const add = (c: ScoredCandidate) => {
    picked.push(c)
    perGroup[c.group]++
    perCat.set(c.category, (perCat.get(c.category) || 0) + 1)
    perSource.set(c.source, (perSource.get(c.source) || 0) + 1)
  }
  for (const k of opts.keep || []) if (picked.length < n && !picked.some((p) => p.key === k.key)) add(k)
  // Quotas scale with N (defaults are for 25) so a preview of 10 still mixes types.
  const quotaSum = DIGEST_GROUPS.reduce((a, g) => a + (s.quotas[g] || 0), 0) || 1
  const quota = (g: DigestGroup) => Math.max(s.quotas[g] > 0 ? 1 : 0, Math.round(((s.quotas[g] || 0) * n) / quotaSum))
  // The per-source cap is for third-party feeds; our own content (Learn, contests, …) is capped by category only.
  const own = (c: ScoredCandidate) => OWN_SOURCES.has(c.source)
  const capsOk = (c: ScoredCandidate) => (perCat.get(c.category) || 0) < s.max_per_category && (own(c) || (perSource.get(c.source) || 0) < s.max_per_source)
  const dupOf = (c: ScoredCandidate) => picked.find((p) => isNearDuplicate(p, c))
  const tryAdd = (c: ScoredCandidate, respectQuota: boolean): boolean => {
    if (picked.length >= n || exclude.has(c.key) || picked.some((p) => p.key === c.key)) return false
    if (respectQuota && perGroup[c.group] >= quota(c.group)) return false
    if (!capsOk(c)) return false
    const d = dupOf(c)
    if (d) {
      if (!duplicates.some((x) => x.key === c.key)) duplicates.push({ key: c.key, of: d.key })
      return false
    }
    add(c)
    return true
  }
  for (const c of scored) tryAdd(c, true)
  let spill = 0
  for (const c of scored) if (tryAdd(c, false)) spill++
  const order = new Map(scored.map((c, i) => [c.key, i]))
  picked.sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9))
  return { items: picked, duplicates, spill }
}
