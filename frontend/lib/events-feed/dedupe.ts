/**
 * Cross-source dedupe (pure). Two listings are the same event when their
 * canonical URLs match, or when their titles are near-identical and their
 * start dates are within a day (titles alone collide too often: "Winter Hack").
 */
import { canonicalUrl } from './normalize'
import type { ExternalEvent } from './types'

const STOP = new Set(['the', 'a', 'an', 'of', 'and', '&', 'for', 'by', 'at', 'in', 'on', 'edition', 'season', 'hackathon', 'hack', 'contest', 'online', 'virtual', 'global'])

/** Lower-case word set with years / ordinals / noise words removed. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^(19|20)\d{2}$/.test(w) && !/^\d+(st|nd|rd|th)$/.test(w))
}

/** Dice coefficient over title tokens (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const A = titleTokens(a)
  const B = titleTokens(b)
  if (!A.length || !B.length) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  const setB = new Set(B)
  const common = [...new Set(A)].filter((w) => setB.has(w)).length
  return (2 * common) / (new Set(A).size + setB.size)
}

const DAY = 24 * 3600_000

export function sameEvent(a: Pick<ExternalEvent, 'url' | 'title' | 'starts_at'>, b: Pick<ExternalEvent, 'url' | 'title' | 'starts_at'>): boolean {
  if (canonicalUrl(a.url) === canonicalUrl(b.url)) return true
  if (!a.starts_at || !b.starts_at) return false
  const close = Math.abs(new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) <= DAY
  return close && titleSimilarity(a.title, b.title) >= 0.8
}

/**
 * Source priority when merging: the organiser's own feed beats aggregators.
 * Lower = better.
 */
export function sourcePriority(source: string): number {
  if (source === 'codespectra') return 0
  if (source.startsWith('ical:') || source.startsWith('rss:')) return 1
  if (['codeforces', 'codechef', 'leetcode', 'kaggle', 'ctftime'].includes(source)) return 2
  if (source === 'simulated') return 9
  return 5
}

/** Merge b into a: keep a's values (higher priority), fill gaps from b. */
export function mergeInto(a: ExternalEvent, b: ExternalEvent): ExternalEvent {
  const pick = <K extends keyof ExternalEvent>(k: K) => (a[k] == null || a[k] === '' ? b[k] : a[k])
  return {
    ...a,
    organiser: pick('organiser'),
    starts_at: pick('starts_at'),
    ends_at: pick('ends_at'),
    registration_deadline: pick('registration_deadline'),
    prize: a.prize?.amount_minor ? a.prize : b.prize?.amount_minor ? b.prize : a.prize || b.prize,
    image: pick('image'),
    location: { city: a.location.city || b.location.city, country: a.location.country || b.location.country },
    themes: [...new Set([...a.themes, ...b.themes])].slice(0, 8),
    raw_description: (a.raw_description?.length || 0) >= (b.raw_description?.length || 0) ? a.raw_description : b.raw_description,
    featured: Boolean(a.featured || b.featured),
  }
}

/** Collapse a batch: returns one event per real-world event plus the aliases it absorbed. */
export function dedupeBatch(events: ExternalEvent[]): { event: ExternalEvent; aliases: ExternalEvent[] }[] {
  const sorted = [...events].sort((x, y) => sourcePriority(x.source) - sourcePriority(y.source))
  const groups: { event: ExternalEvent; aliases: ExternalEvent[] }[] = []
  for (const e of sorted) {
    const g = groups.find((g) => sameEvent(g.event, e) || g.aliases.some((x) => sameEvent(x, e)))
    if (g) {
      g.event = mergeInto(g.event, e)
      g.aliases.push(e)
    } else {
      groups.push({ event: e, aliases: [] })
    }
  }
  return groups
}
