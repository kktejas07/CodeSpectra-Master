/**
 * Client-safe helpers for the public events pages: labels, UI filters, UTM
 * links, share links. No server imports.
 */
import type { EventKind, EventMode, FeedEventDoc, PublicFeedEvent } from './types'

export const KIND_LABELS: Record<EventKind, string> = {
  hackathon: 'Hackathon', codeathon: 'Codeathon', buildathon: 'Buildathon', ctf: 'CTF', competition: 'Competition', conference: 'Conference',
  datathon: 'Datathon', ideathon: 'Ideathon', promptathon: 'Prompt-a-thon', debugathon: 'Debug-a-thon', code_golf: 'Code golf', design_jam: 'Design jam', open_source: 'Open-source sprint',
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
    student_friendly: isStudentFriendly({ title: d.title, organiser: d.organiser, themes: d.themes || [], source: d.source, internal: d.internal }),
  }
}

/** Sources whose listings are (almost) all student events. */
const STUDENT_SOURCES = new Set(['hackclub', 'mlh', 'devfolio', 'unstop'])
const STUDENT_RE = /\b(students?|universit(y|ies)|colleges?|campus|undergrad\w*|high[- ]school|freshers?|first[- ]timers?|beginners?|iit|nit|bits|mlh|hack club)\b/i

/** Pure: is this event aimed at / open to students? Our own events always are. */
export function isStudentFriendly(e: { title: string; organiser: string | null; themes: string[]; source: string; internal?: boolean }): boolean {
  if (e.internal || STUDENT_SOURCES.has(e.source)) return true
  if (e.themes.some((t) => t === 'students' || t === 'beginner-friendly' || t === 'mlh')) return true
  return STUDENT_RE.test(`${e.title} ${e.organiser || ''}`)
}

export const REGIONS = ['india', 'asia-pacific', 'europe', 'north-america', 'latin-america', 'middle-east-africa'] as const
export type Region = (typeof REGIONS)[number]
export const REGION_LABELS: Record<Region, string> = {
  india: 'India', 'asia-pacific': 'Asia-Pacific', europe: 'Europe', 'north-america': 'North America', 'latin-america': 'Latin America', 'middle-east-africa': 'Middle East & Africa',
}
const REGION_COUNTRIES: Record<Exclude<Region, 'india'>, string> = {
  'asia-pacific': 'PK BD LK NP BT MV SG MY ID PH VN TH KH MM JP KR CN HK TW MO AU NZ',
  europe: 'GB IE DE FR ES IT NL BE LU CH AT PT PL CZ SK HU SE NO DK FI IS EE LV LT GR RO BG HR SI RS UA TR',
  'north-america': 'US CA MX',
  'latin-america': 'BR AR CL CO PE UY PY BO EC VE CR PA GT DO',
  'middle-east-africa': 'AE SA QA KW BH OM JO LB IL EG NG KE GH ZA MA TN ET RW UG TZ',
}

/** Pure: ISO-2 country → region, or null (unknown / online). */
export function regionOf(country: string | null | undefined): Region | null {
  const c = (country || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(c)) return null
  if (c === 'IN') return 'india'
  for (const [r, list] of Object.entries(REGION_COUNTRIES)) if (list.split(' ').includes(c)) return r as Region
  return null
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Pure: Google Calendar "add event" link (no end → 2 hours). */
export function googleCalendarUrl(ev: Pick<PublicFeedEvent, 'title' | 'starts_at' | 'ends_at' | 'summary' | 'mode' | 'city' | 'country'>, pageUrl: string): string | null {
  if (!ev.starts_at || !Number.isFinite(Date.parse(ev.starts_at))) return null
  const end = ev.ends_at && Date.parse(ev.ends_at) > Date.parse(ev.starts_at) ? ev.ends_at : new Date(Date.parse(ev.starts_at) + 2 * 3600_000).toISOString()
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title.slice(0, 200),
    dates: `${icsStamp(ev.starts_at)}/${icsStamp(end)}`,
    details: `${ev.summary.slice(0, 600)}\n\n${pageUrl}`,
    location: ev.mode === 'online' ? 'Online' : [ev.city, ev.country].filter(Boolean).join(', '),
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
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
  /** In-person / hybrid events in these regions. */
  regions?: Region[]
  /** Only events aimed at / open to students. */
  student?: boolean
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
    if (f.regions?.length) { const r = regionOf(e.country); if (!r || !f.regions.includes(r)) return false }
    if (f.student && !(e.student_friendly ?? isStudentFriendly(e))) return false
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
