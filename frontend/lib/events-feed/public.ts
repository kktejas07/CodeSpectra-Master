/**
 * Client-safe helpers for the public events pages: labels, UI filters, UTM
 * links, share links. No server imports.
 */
import type { EventKind, EventMode, FeedEventDoc, PublicFeedEvent } from './types'

export const KIND_LABELS: Record<EventKind, string> = {
  hackathon: 'Hackathon', codeathon: 'Codeathon', buildathon: 'Buildathon', ctf: 'CTF', competition: 'Competition', conference: 'Conference',
}
export const MODE_LABELS: Record<EventMode, string> = { online: 'Online', in_person: 'In person', hybrid: 'Hybrid' }

export function toPublic(d: FeedEventDoc): PublicFeedEvent {
  return {
    id: d.id, title: d.title, url: d.url, organiser: d.organiser, kind: d.kind, mode: d.mode,
    city: d.location?.city || null, country: d.location?.country || null,
    starts_at: d.starts_at, ends_at: d.ends_at, registration_deadline: d.registration_deadline,
    prize_text: d.prize?.text || null, prize_usd_minor: d.prize?.usd_minor ?? null,
    themes: d.themes || [], image: d.image, summary: d.description_summary,
    featured: d.featured, internal: d.internal, source: d.source,
  }
}

export interface UiFilters {
  q?: string
  kinds?: EventKind[]
  modes?: EventMode[]
  countries?: string[]
  themes?: string[]
  /** Only events with a cash prize. */
  prize?: boolean
  /** Registration closes within 7 days. */
  deadline_soon?: boolean
  from?: string | null
  to?: string | null
}

const DAY = 24 * 3600_000

/** Pure filter used by the page (client) and GET /api/events-feed (server). */
export function filterEvents(events: PublicFeedEvent[], f: UiFilters, now = new Date()): PublicFeedEvent[] {
  const q = (f.q || '').trim().toLowerCase()
  const fromMs = f.from ? new Date(f.from).getTime() : null
  const toMs = f.to ? new Date(f.to).getTime() + DAY - 1 : null
  return events.filter((e) => {
    if (q && !`${e.title} ${e.organiser || ''} ${e.city || ''} ${e.themes.join(' ')}`.toLowerCase().includes(q)) return false
    if (f.kinds?.length && !f.kinds.includes(e.kind)) return false
    if (f.modes?.length && !f.modes.includes(e.mode)) return false
    if (f.countries?.length && !(e.country && f.countries.includes(e.country))) return false
    if (f.themes?.length && !e.themes.some((t) => f.themes!.includes(t))) return false
    if (f.prize && !(e.prize_usd_minor && e.prize_usd_minor > 0)) return false
    if (f.deadline_soon) {
      const d = e.registration_deadline ? new Date(e.registration_deadline).getTime() : null
      if (!d || d < now.getTime() || d > now.getTime() + 7 * DAY) return false
    }
    const start = e.starts_at ? new Date(e.starts_at).getTime() : null
    const end = e.ends_at ? new Date(e.ends_at).getTime() : start
    if (fromMs != null && (end == null || end < fromMs)) return false
    if (toMs != null && (start == null || start > toMs)) return false
    return true
  })
}

/** Featured first, then soonest start; undated last. */
export function sortEvents(events: PublicFeedEvent[]): PublicFeedEvent[] {
  return [...events].sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    const as = a.starts_at ? Date.parse(a.starts_at) : Infinity
    const bs = b.starts_at ? Date.parse(b.starts_at) : Infinity
    return as - bs
  })
}

/** Outbound link with our UTM tags (existing utm_* kept). Internal links unchanged. */
export function withUtm(url: string, internal: boolean, medium = 'events'): string {
  if (internal) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'codespectra')
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', medium)
    if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', 'events_feed')
    return u.toString()
  } catch {
    return url
  }
}

export function shareLinks(pageUrl: string, title: string) {
  const u = encodeURIComponent(pageUrl)
  const t = encodeURIComponent(title)
  return {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${pageUrl}`)}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
  }
}

export function formatRange(startIso: string | null, endIso: string | null, tz?: string): string {
  if (!startIso) return 'Dates to be announced'
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', ...(tz ? { timeZone: tz } : {}) }
  const s = new Date(startIso)
  const a = s.toLocaleDateString('en-US', opts)
  if (!endIso) return `${a}, ${s.getFullYear()}`
  const e = new Date(endIso)
  const b = e.toLocaleDateString('en-US', opts)
  return a === b ? `${a}, ${e.getFullYear()}` : `${a} – ${b}, ${e.getFullYear()}`
}

/** Short ISO-2 → country name for chips (falls back to the code). */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}
