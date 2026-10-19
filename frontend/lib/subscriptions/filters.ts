/**
 * Pure helpers: input normalisation, event filter matching, quiet hours and
 * the WhatsApp 24-hour session window. No I/O.
 */
import {
  CHANNELS, EVENT_KINDS, EVENT_MODES, TOPICS,
  type Channel, type EventFilters, type EventKind, type EventMode, type Topic, type TopicFilters,
} from './types'

const uniq = <T,>(a: T[]) => [...new Set(a)]
const strList = (v: unknown, max = 50, len = 60): string[] =>
  Array.isArray(v) ? uniq(v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, len))).slice(0, max) : []

export function normalizeChannels(v: unknown): Channel[] {
  return strList(v).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c))
}

export function normalizeTopics(v: unknown): Topic[] {
  return strList(v).filter((t): t is Topic => (TOPICS as readonly string[]).includes(t))
}

/** Lower-case slug for themes so "AI / ML" and "ai-ml" meet. */
export function slugTheme(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

export function normalizeEventFilters(v: unknown): EventFilters {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: EventFilters = {}
  const kinds = strList(o.kinds).filter((k): k is EventKind => (EVENT_KINDS as readonly string[]).includes(k))
  const modes = strList(o.modes).filter((m): m is EventMode => (EVENT_MODES as readonly string[]).includes(m))
  const countries = strList(o.countries).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
  const themes = uniq(strList(o.themes).map(slugTheme).filter(Boolean))
  if (kinds.length) out.kinds = kinds
  if (modes.length) out.modes = modes
  if (countries.length) out.countries = countries
  if (themes.length) out.themes = themes
  const minPrize = Number(o.min_prize_usd_minor)
  if (Number.isInteger(minPrize) && minPrize > 0) out.min_prize_usd_minor = Math.min(minPrize, 1e12)
  return out
}

export function normalizeTopicFilters(v: unknown): TopicFilters {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: TopicFilters = {}
  if (o.events) out.events = normalizeEventFilters(o.events)
  if (o.blog && typeof o.blog === 'object') {
    const categories = strList((o.blog as Record<string, unknown>).categories).map(slugTheme)
    out.blog = categories.length ? { categories } : {}
  }
  return out
}

/** The slice of an event that filters look at. */
export interface FilterableEvent {
  kind: EventKind
  mode: EventMode
  country: string | null
  themes: string[]
  prize_usd_minor: number | null
}

/**
 * Does an event match a subscriber's event filters?
 * Location: no modes and no countries → anywhere. Online/hybrid events pass when
 * the person wants 'online'; in-person/hybrid events pass when their country is
 * listed; with modes but no countries, the mode must match.
 */
export function matchesEventFilters(ev: FilterableEvent, f: EventFilters | undefined): boolean {
  if (!f) return true
  if (f.kinds?.length && !f.kinds.includes(ev.kind)) return false
  if (f.themes?.length) {
    const want = f.themes.map(slugTheme)
    if (!ev.themes.some((t) => want.includes(slugTheme(t)))) return false
  }
  if (f.min_prize_usd_minor && !(ev.prize_usd_minor && ev.prize_usd_minor >= f.min_prize_usd_minor)) return false
  const modes = f.modes || []
  const countries = f.countries || []
  if (!modes.length && !countries.length) return true
  if (modes.includes('online') && ev.mode !== 'in_person') return true
  if (countries.length && ev.mode !== 'online' && ev.country && countries.includes(ev.country.toUpperCase())) return true
  if (!countries.length && modes.includes(ev.mode)) return true
  return false
}

/** Hour (0–23) and minute in an IANA zone; falls back to UTC for a bad zone. */
export function localHourMinute(at: Date, tz: string): { h: number; m: number; dow: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(at)
    const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
    return { h: Number(get('hour')) % 24, m: Number(get('minute')), dow }
  } catch {
    return { h: at.getUTCHours(), m: at.getUTCMinutes(), dow: at.getUTCDay() }
  }
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** Inside [startHour, endHour) local time; windows may wrap midnight (21 → 8). */
export function inQuietHours(at: Date, tz: string, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false
  const { h } = localHourMinute(at, tz)
  return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour
}

/** Meta allows free-form messages only within 24 h of the person's last message. */
export function inWhatsAppSession(lastInboundAt: string | null | undefined, now: Date): boolean {
  if (!lastInboundAt) return false
  const t = new Date(lastInboundAt).getTime()
  return Number.isFinite(t) && now.getTime() - t < 24 * 3600_000 - 60_000
}

/** Inbound WhatsApp keywords. */
export const STOP_RE = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel)\s*[.!]?\s*$/i
export const START_RE = /^\s*(start|yes|subscribe|unstop)\s*[.!]?\s*$/i

const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout'])

/**
 * Opt-out keyword (industry set: STOP, STOP ALL, UNSUBSCRIBE, CANCEL, END, QUIT, OPT OUT / OPT-OUT /
 * OPTOUT), case- and punctuation-insensitive, as the LEADING word of a short message
 * ("Stop please", "STOP!!", "stop sending me these"). Longer messages that merely start with
 * "end" / "cancel" are conversation, not an opt-out.
 */
export function isStopMessage(text: string | null | undefined): boolean {
  const words = String(text || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean)
  if (!words.length || words.length > 5) return false
  if (words[0] === 'opt' && words[1] === 'out') return true
  return STOP_WORDS.has(words[0])
}
