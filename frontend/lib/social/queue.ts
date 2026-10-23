/**
 * Social studio queue — source mappers, dedupe, filters, roundup pick and
 * stats (pure, no I/O; lib/social/store.ts and ./sync.ts do the reads).
 *
 * Each mapper turns one published row of an existing collection into a
 * QueueInput, or null when it must not be queued (hidden, internal, ended,
 * draft). Only the row's own fields are used — captions may not add facts.
 */
import { z } from 'zod'
import type { QueueInput, SocialFacts, SocialItemType, SocialPlatform, SocialQueueDoc } from './types'
import { SOCIAL_ITEM_TYPES, SOCIAL_PLATFORMS } from './types'
import { isoWeekKey } from './share'

export const BACKFILL_DAYS = 14

export const queueKey = (type: SocialItemType, refId: string): string => `${type}:${refId}`

const clip = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const iso = (v: unknown): string | null => {
  if (typeof v !== 'string' && !(v instanceof Date)) return null
  const t = Date.parse(String(v instanceof Date ? v.toISOString() : v))
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const abs = (origin: string, path: string) => `${origin.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
/** A publisher image we may link to (http(s) only). */
const imageUrl = (v: unknown, origin: string): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  if (s.startsWith('/')) return abs(origin, s)
  return /^https?:\/\//i.test(s) ? s.slice(0, 1000) : null
}
const isOwn = (img: string | null, origin: string) => !!img && img.startsWith(origin.replace(/\/+$/, ''))
const tags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().slice(0, 40)).slice(0, 8) : [])

// ─── Mappers ────────────────────────────────────────────────────────────────

export interface FeedRow {
  id: string; title: string; status: string; internal?: boolean; featured?: boolean; source: string; organiser?: string | null
  kind?: string; mode?: string; location?: { city?: string | null; country?: string | null } | null
  starts_at?: string | null; ends_at?: string | null; registration_deadline?: string | null
  prize?: { text?: string | null } | null; themes?: string[]; image?: string | null; description_summary?: string; first_seen_at?: string
}

/** Events feed row (public, not hidden, not ours — our own events are queued from their own collections). */
export function fromFeedEvent(d: FeedRow, origin: string, now: Date): QueueInput | null {
  if (!d?.id || d.status !== 'published' || d.internal) return null
  if (d.ends_at && Date.parse(d.ends_at) < now.getTime()) return null
  const image = imageUrl(d.image, origin)
  return {
    type: 'event', ref_id: d.id, title: clip(d.title, 200), summary: clip(d.description_summary, 400),
    url: abs(origin, `/events/${encodeURIComponent(d.id)}`), image, image_own: isOwn(image, origin), source: clip(d.source, 60) || 'feed',
    facts: {
      starts_at: iso(d.starts_at), ends_at: iso(d.ends_at), deadline: iso(d.registration_deadline), prize: clip(d.prize?.text, 80) || null,
      mode: clip(d.mode, 20) || null, city: clip(d.location?.city, 60) || null, organiser: clip(d.organiser, 80) || null, tags: tags(d.themes),
    },
    published_at: iso(d.first_seen_at),
  }
}

export interface BlogRow { id: string; slug: string; title: string; excerpt?: string; cover_image?: string; tags?: string[]; status: string; published_at?: string | null; source_note?: string; author_name?: string; category?: string }

/** /news post (blog post tagged signals). */
export function fromNewsPost(p: BlogRow, origin: string): QueueInput | null {
  if (!p?.slug || p.status !== 'published') return null
  const image = imageUrl(p.cover_image, origin)
  return {
    type: 'news', ref_id: p.id || p.slug, title: clip(p.title, 200), summary: clip(p.excerpt, 400),
    url: abs(origin, `/news/${encodeURIComponent(p.slug)}`), image, image_own: isOwn(image, origin), source: 'news',
    facts: { organiser: clip(p.source_note, 80) || null, tags: tags(p.tags).filter((t) => t !== 'signals' && !t.startsWith('news:')) },
    published_at: iso(p.published_at),
  }
}

/** "From the team" blog post shown in Learn; `path` from teamPublicPaths. */
export function fromTeamPost(p: BlogRow, path: string, origin: string): QueueInput | null {
  if (!p?.slug || p.status !== 'published' || !path) return null
  const image = imageUrl(p.cover_image, origin)
  return {
    type: 'learn', ref_id: `blog:${p.id || p.slug}`, title: clip(p.title, 200), summary: clip(p.excerpt, 400),
    url: abs(origin, path), image, image_own: isOwn(image, origin), source: 'team',
    facts: { tags: tags(p.tags) }, published_at: iso(p.published_at),
  }
}

export interface LearnRow { id: string; slug: string; title: string; summary?: string; status: string; level?: string; tags?: string[]; reading_minutes?: number; published_at?: string | null; locale?: string }

export function fromLearnPost(p: LearnRow, origin: string): QueueInput | null {
  if (!p?.slug || p.status !== 'published') return null
  if (p.locale && p.locale !== 'en') return null // translations share the English post
  return {
    type: 'learn', ref_id: p.id, title: clip(p.title, 200), summary: clip(p.summary, 400),
    url: abs(origin, `/learn/${encodeURIComponent(p.slug)}`), image: null, image_own: false, source: 'learn',
    facts: { level: clip(p.level, 30) || null, duration_min: typeof p.reading_minutes === 'number' ? p.reading_minutes : null, tags: tags(p.tags) },
    published_at: iso(p.published_at),
  }
}

export interface ContestRow { id: string; slug: string; title: string; summary?: string; status: string; visibility?: string; format?: string; prize_text?: string; banner_url?: string; published_at?: string | null; schedule?: { starts_at?: string; ends_at?: string; registration_closes_at?: string | null } }

export function fromContest(c: ContestRow, origin: string, now: Date): QueueInput | null {
  if (!c?.slug || c.status !== 'published' || c.visibility !== 'public') return null
  if (c.schedule?.ends_at && Date.parse(c.schedule.ends_at) < now.getTime()) return null
  const image = imageUrl(c.banner_url, origin)
  return {
    type: 'contest', ref_id: c.id, title: clip(c.title, 200), summary: clip(c.summary, 400),
    url: abs(origin, `/contests/${encodeURIComponent(c.slug)}`), image, image_own: !!image, source: 'codespectra',
    facts: { starts_at: iso(c.schedule?.starts_at), ends_at: iso(c.schedule?.ends_at), deadline: iso(c.schedule?.registration_closes_at), prize: clip(c.prize_text, 80) || null, mode: 'online', tags: c.format ? [c.format] : [] },
    published_at: iso(c.published_at),
  }
}

export interface OwnEventRow { type: 'hackathon' | 'codeathon'; id: string; slug?: string; title: string; description?: string; starts_at?: string; ends_at?: string; banner_url?: string; duration?: string }

export function fromOwnEvent(e: OwnEventRow, origin: string, now: Date): QueueInput | null {
  if (!e?.id || !e.title) return null
  if (e.ends_at && Date.parse(e.ends_at) < now.getTime()) return null
  const path = e.type === 'hackathon' && e.slug ? `/hackathons/${encodeURIComponent(e.slug)}` : `/dashboard/codeathons/${encodeURIComponent(e.id)}`
  const image = imageUrl(e.banner_url, origin)
  return {
    type: e.type, ref_id: e.id, title: clip(e.title, 200), summary: clip(e.description, 400),
    url: abs(origin, path), image, image_own: !!image, source: 'codespectra',
    facts: { starts_at: iso(e.starts_at), ends_at: iso(e.ends_at), mode: 'online', organiser: 'CodeSpectra' },
    published_at: null,
  }
}

export interface ProgramRow { id: string; slug: string; title: string; summary?: string; status: string; level?: string; duration_min?: number; skills?: string[]; published_at?: string | null }

export function fromProgram(p: ProgramRow, origin: string): QueueInput | null {
  if (!p?.slug || p.status !== 'published') return null
  return {
    type: 'certification', ref_id: p.id, title: clip(p.title, 200), summary: clip(p.summary, 400),
    url: abs(origin, `/certifications/${encodeURIComponent(p.slug)}`), image: null, image_own: false, source: 'codespectra',
    facts: { level: clip(p.level, 30) || null, duration_min: typeof p.duration_min === 'number' ? p.duration_min : null, mode: 'online', tags: tags(p.skills) },
    published_at: iso(p.published_at),
  }
}

export interface PatternRow { id: string; companySlug: string; companyName: string; examName: string; active: boolean; verified: boolean; createdAt?: string; sections?: { timeMinutes?: number }[] }

/** Company practice test (`publicSlugs`: companies with a public /companies page). */
export function fromCompanyPattern(p: PatternRow, origin: string, publicSlugs: ReadonlySet<string>): QueueInput | null {
  if (!p?.id || !p.active || !p.verified) return null
  const minutes = (p.sections || []).reduce((n, s) => n + (typeof s.timeMinutes === 'number' ? s.timeMinutes : 0), 0)
  const path = publicSlugs.has(p.companySlug) ? `/companies/${encodeURIComponent(p.companySlug)}` : `/dashboard/company-tests/${encodeURIComponent(p.id)}`
  return {
    type: 'company_test', ref_id: p.id, title: clip(`${p.companyName} ${p.examName}`, 200), summary: '',
    url: abs(origin, path), image: null, image_own: false, source: 'codespectra',
    facts: { company: clip(p.companyName, 80) || null, duration_min: minutes || null, mode: 'online' },
    published_at: iso(p.createdAt),
  }
}

// ─── Dedupe ─────────────────────────────────────────────────────────────────

const urlKey = (u: string) => {
  try {
    const x = new URL(u)
    return `${x.host}${x.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return u.toLowerCase()
  }
}

/**
 * One entry per key and per public URL (pure). Later duplicates of a key are
 * merged into the first (missing fields filled); a second item pointing at the
 * same page (e.g. a contest also listed as an event) is dropped.
 */
export function dedupeQueueInputs(items: readonly (QueueInput | null | undefined)[]): QueueInput[] {
  const byKey = new Map<string, QueueInput>()
  const urls = new Map<string, string>()
  for (const it of items) {
    if (!it || !it.title || !it.url) continue
    const k = queueKey(it.type, it.ref_id)
    const cur = byKey.get(k)
    if (cur) {
      byKey.set(k, {
        ...cur,
        summary: cur.summary || it.summary,
        image: cur.image || it.image,
        image_own: cur.image ? cur.image_own : it.image_own,
        published_at: cur.published_at || it.published_at,
        facts: { ...it.facts, ...Object.fromEntries(Object.entries(cur.facts).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length))) },
      })
      continue
    }
    const u = urlKey(it.url)
    if (urls.has(u)) continue
    urls.set(u, k)
    byKey.set(k, it)
  }
  return [...byKey.values()]
}

/** Keep inputs published inside the window (unknown time = keep: we first see it now). */
export function inWindow(it: QueueInput, since: Date): boolean {
  return !it.published_at || Date.parse(it.published_at) >= since.getTime()
}

// ─── Filters ────────────────────────────────────────────────────────────────

export const QueueFilterSchema = z.object({
  type: z.enum(SOCIAL_ITEM_TYPES).optional(),
  status: z.enum(['all', 'not_posted', 'posted']).default('all'),
  platform: z.enum(SOCIAL_PLATFORMS).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
})
export type QueueFilter = z.infer<typeof QueueFilterSchema>

/** Mongo filter for the queue list (pure). Search is a literal, escaped, case-insensitive match. */
export function queueMongoFilter(f: QueueFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  if (f.type) q.type = f.type
  const posted = f.platform ? `posts.${f.platform}` : null
  if (f.status === 'not_posted') Object.assign(q, posted ? { [posted]: { $exists: false } } : { posted_count: 0 })
  if (f.status === 'posted') Object.assign(q, posted ? { [posted]: { $exists: true } } : { posted_count: { $gt: 0 } })
  if (f.from || f.to) {
    const r: Record<string, string> = {}
    if (f.from) r.$gte = `${f.from}T00:00:00.000Z`
    if (f.to) r.$lte = `${f.to}T23:59:59.999Z`
    q.published_at = r
  }
  if (f.q) {
    const rx = { $regex: f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    q.$or = [{ title: rx }, { summary: rx }, { source: rx }]
  }
  return q
}

// ─── Roundup ────────────────────────────────────────────────────────────────

export const ROUNDUP_TYPES: readonly SocialItemType[] = ['event', 'news', 'contest', 'hackathon', 'codeathon']

/** Top `n` items of the week for a roundup (pure): ours first, then prizes, open deadlines, newest. */
export function pickRoundup<T extends Pick<SocialQueueDoc, 'id' | 'type' | 'published_at' | 'facts' | 'source'>>(items: readonly T[], n: number, now: Date): T[] {
  const since = now.getTime() - 7 * 86_400_000
  const score = (it: T) =>
    (it.source === 'codespectra' ? 3 : 0) + (it.facts.prize ? 2 : 0) + (it.facts.deadline && Date.parse(it.facts.deadline) > now.getTime() ? 1 : 0) + (it.type === 'news' ? 0.5 : 0)
  return items
    .filter((it) => ROUNDUP_TYPES.includes(it.type) && Date.parse(it.published_at) >= since)
    .sort((a, b) => score(b) - score(a) || Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, Math.max(1, Math.min(10, Math.floor(n))))
}

export function roundupInput(items: readonly Pick<SocialQueueDoc, 'id' | 'title' | 'type' | 'url'>[], origin: string, now: Date): QueueInput {
  const week = isoWeekKey(now)
  return {
    type: 'roundup', ref_id: week, title: `This week on CodeSpectra (${week})`, summary: '',
    url: abs(origin, items.some((i) => i.type !== 'news') ? '/events' : '/news'), image: null, image_own: false, source: 'codespectra',
    facts: { items: items.slice(0, 10).map((i) => ({ id: i.id, title: clip(i.title, 140), type: i.type, url: i.url })) },
    published_at: now.toISOString(),
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Posts per platform per ISO week, newest week first (pure). */
export function weeklyPostCounts(docs: readonly Pick<SocialQueueDoc, 'posts'>[], weeks: number, now: Date): { week: string; counts: Record<SocialPlatform, number> }[] {
  const keys: string[] = []
  for (let i = 0; i < weeks; i++) {
    const k = isoWeekKey(new Date(now.getTime() - i * 7 * 86_400_000))
    if (!keys.includes(k)) keys.push(k)
  }
  const rows = new Map(keys.map((k) => [k, Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, 0])) as Record<SocialPlatform, number>]))
  for (const d of docs) {
    for (const [p, mark] of Object.entries(d.posts || {})) {
      if (!mark?.at) continue
      const row = rows.get(isoWeekKey(new Date(mark.at)))
      if (row && p in row) row[p as SocialPlatform]++
    }
  }
  return keys.map((week) => ({ week, counts: rows.get(week)! }))
}

/** Facts as short labelled lines for prompts and cards (pure). Dates as "3 Nov 2026" (UTC). */
export function factLines(f: SocialFacts): { key: string; value: string }[] {
  const d = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '')
  const out: { key: string; value: string }[] = []
  if (f.starts_at) out.push({ key: 'starts', value: d(f.starts_at) })
  if (f.ends_at) out.push({ key: 'ends', value: d(f.ends_at) })
  if (f.deadline && f.deadline !== f.ends_at) out.push({ key: 'deadline', value: d(f.deadline) })
  if (f.prize) out.push({ key: 'prize', value: f.prize })
  if (f.mode) out.push({ key: 'mode', value: f.mode })
  if (f.city) out.push({ key: 'city', value: f.city })
  if (f.organiser) out.push({ key: 'organiser', value: f.organiser })
  if (f.company) out.push({ key: 'company', value: f.company })
  if (f.level) out.push({ key: 'level', value: f.level })
  if (f.duration_min) out.push({ key: 'duration', value: `${f.duration_min} min` })
  return out
}
