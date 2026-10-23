/**
 * Content QA loop — pure checks (client-safe, tested).
 *
 * Weekly, in rotating batches: published Learn posts (broken links, possibly
 * outdated, low engagement), published tech news (dead source link, a deadline
 * or event date that has passed) and approved coding questions in the bank
 * (reference solution re-run in the sandbox). Findings propose unpublish /
 * back-to-draft / deactivate; an admin decides.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MON = MONTHS.map((m) => m.slice(0, 3))

/** External http(s) links in markdown (links, autolinks, bare URLs), unique, without code blocks. */
export function extractLinks(md: string, max = 50): string[] {
  const prose = String(md || '').replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ')
  const out = new Set<string>()
  for (const m of prose.matchAll(/https?:\/\/[^\s<>()"'\]]+/gi)) {
    const url = m[0].replace(/[.,;:!?)]+$/, '')
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') out.add(u.toString())
    } catch { /* not a URL */ }
    if (out.size >= max) break
  }
  return [...out]
}

/** Dates written in text (2026-03-01, 1 March 2026, March 1, 2026, Mar 1 2026) as UTC day starts. */
export function datesInText(text: string): Date[] {
  const s = String(text || '').toLowerCase()
  const out: Date[] = []
  const push = (y: number, m: number, d: number) => {
    if (y < 2000 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return
    out.push(new Date(Date.UTC(y, m, d)))
  }
  for (const m of s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) push(+m[1], +m[2] - 1, +m[3])
  const month = (w: string) => { const i = MON.indexOf(w.slice(0, 3)); return i }
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(20\d{2})\b/g)) if (month(m[2]) >= 0) push(+m[3], month(m[2]), +m[1])
  for (const m of s.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/g)) if (month(m[1]) >= 0) push(+m[3], month(m[1]), +m[2])
  return out
}

const TIME_SENSITIVE = /\b(deadline|register|registration|registrations|last date|apply by|applications? (close|open)|closes?|ends? on|upcoming|will be held|will take place|starts? on|scheduled for|early bird|submit by)\b/i

/**
 * News that reads as an announcement for a date that has passed (the reader
 * would act on stale information): time-sensitive wording, every date in the
 * text is over a week old, and the post is at least 30 days old.
 */
export function staleNewsReason(post: { title: string; excerpt?: string | null; published_at?: string | null }, now: Date): { stale: boolean; last_date?: string } {
  const text = `${post.title} ${post.excerpt || ''}`
  const published = post.published_at ? Date.parse(post.published_at) : NaN
  if (!Number.isFinite(published) || now.getTime() - published < 30 * 86_400_000) return { stale: false }
  if (!TIME_SENSITIVE.test(text)) return { stale: false }
  const dates = datesInText(text)
  if (!dates.length) return { stale: false }
  const last = Math.max(...dates.map((d) => d.getTime()))
  if (now.getTime() - last < 7 * 86_400_000) return { stale: false }
  return { stale: true, last_date: new Date(last).toISOString().slice(0, 10) }
}

/**
 * A Learn post that may have aged: not updated for a year and its prose
 * mentions a year at least 3 years back or "latest / current version" wording.
 * Code blocks are ignored.
 */
export function outdatedReason(post: { body: string; updated_at?: string | null; published_at?: string | null }, now: Date): { outdated: boolean; year?: number; wording?: boolean } {
  const touched = Date.parse(post.updated_at || post.published_at || '')
  if (!Number.isFinite(touched) || now.getTime() - touched < 365 * 86_400_000) return { outdated: false }
  const prose = String(post.body || '').replace(/```[\s\S]*?```|`[^`\n]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  const years = [...prose.matchAll(/\b(20[0-4]\d)\b/g)].map((m) => +m[1]).filter((y) => y <= now.getUTCFullYear() - 3)
  const wording = /\b(latest (version|release)|as of (20\d{2}|this year)|currently (supports|the newest)|newest version)\b/i.test(prose)
  if (!years.length && !wording) return { outdated: false }
  return { outdated: true, ...(years.length ? { year: Math.max(...years) } : {}), wording }
}

/** Live for `minAgeDays` and still under `minViews` views. */
export function lowEngagement(post: { published_at?: string | null; stats?: { views?: number } | null }, now: Date, minViews = 20, minAgeDays = 60): boolean {
  const at = Date.parse(post.published_at || '')
  if (!Number.isFinite(at) || now.getTime() - at < minAgeDays * 86_400_000) return false
  return (post.stats?.views ?? 0) < minViews
}

/**
 * Rotating batch: the next `n` ids after `cursor` (wrapping round), so every
 * item is re-checked within a few weekly runs. Returns the batch and the new cursor.
 */
export function rotatingBatch<T extends { id: string }>(sortedById: readonly T[], cursor: string | null | undefined, n: number): { batch: T[]; cursor: string | null } {
  if (!sortedById.length || n <= 0) return { batch: [], cursor: cursor ?? null }
  const start = cursor ? sortedById.findIndex((x) => x.id > cursor) : 0
  const from = start < 0 ? 0 : start
  const batch: T[] = []
  for (let i = 0; i < Math.min(n, sortedById.length); i++) batch.push(sortedById[(from + i) % sortedById.length])
  return { batch, cursor: batch.at(-1)?.id ?? null }
}

export const findingKey = (loop: string, kind: string, targetType: string, id: string): string => `${loop}:${kind}:${targetType}:${id}`.slice(0, 300)
