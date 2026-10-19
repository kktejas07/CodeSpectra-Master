/**
 * Pure normalisation helpers for the events feed: time zones → UTC, URL
 * canonicalisation, prize parsing (integer minor units), country codes, kind
 * inference, theme tagging and our own fallback summary. No I/O.
 */
import type { EventKind, EventMode, ExternalEvent, Prize } from './types'

// ─── Time ───────────────────────────────────────────────────────────────────

/** Offset (ms) of `tz` from UTC at instant `ms`. */
export function tzOffsetMs(ms: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms))
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
    return asUtc - Math.floor(ms / 1000) * 1000
  } catch {
    return 0
  }
}

/** Wall-clock time in `tz` → UTC ms (DST-safe: offset re-evaluated at the result). */
export function zonedToUtcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  const first = guess - tzOffsetMs(guess, tz)
  return guess - tzOffsetMs(first, tz)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Anything a source gives us → UTC ISO, or null.
 *  - numbers: unix seconds (< 1e12) or ms
 *  - ISO strings with Z / ±hh:mm: exact
 *  - naive "YYYY-MM-DD[ T]HH:mm[:ss]" / "YYYY-MM-DD" / "Oct 21, 2026": read in `tz` (default UTC)
 *  - iCal "20261021T090000Z" / "20261021T090000" / "20261021"
 */
export function toUtcIso(v: unknown, tz = 'UTC'): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null
    return new Date(v < 1e12 ? v * 1000 : v).toISOString()
  }
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (/^\d{9,13}$/.test(s)) return toUtcIso(Number(s), tz)
  let m = s.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', z] = m
    const ms = z ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) : zonedToUtcMs(+y, +mo, +d, +h, +mi, +se, tz)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m
    const ms = zonedToUtcMs(+y, +mo, +d, +h, +mi, +se, tz)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i)
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1
    if (!mo) return null
    let h = m[4] ? Number(m[4]) : 0
    if (m[6]) h = (h % 12) + (m[6].toLowerCase() === 'pm' ? 12 : 0)
    const ms = zonedToUtcMs(+m[3], mo, +m[2], h, m[5] ? +m[5] : 0, 0, tz)
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  return null
}

/** End-of-day for a date-only end ("Oct 30" means through Oct 30). */
export function endOfDayIfDateOnly(raw: unknown, iso: string | null): string | null {
  if (!iso) return null
  const s = typeof raw === 'string' ? raw.trim() : ''
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{8}$/.test(s) || /^[A-Za-z]{3}[a-z]*\.?\s+\d{1,2},?\s+\d{4}$/.test(s)
  return dateOnly ? new Date(new Date(iso).getTime() + 24 * 3600_000 - 1000).toISOString() : iso
}

// ─── URLs ───────────────────────────────────────────────────────────────────

const TRACKING = /^(utm_\w+|ref|ref_src|referrer|source|fbclid|gclid|mc_cid|mc_eid|igshid|si|lang|tab)$/i

/** Absolute http(s) URL or null. */
export function httpUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) return null
  try {
    const u = base ? new URL(raw.trim(), base) : new URL(raw.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Dedupe key: https, no www, lower-case host, no tracking params / fragment / trailing slash. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.protocol = 'https:'
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')
    u.hash = ''
    u.port = ''
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k)
    u.searchParams.sort()
    let path = u.pathname.replace(/\/+$/, '').replace(/\/(index\.html?)$/i, '')
    if (!path) path = ''
    const q = u.searchParams.toString()
    return `https://${u.hostname}${path}${q ? `?${q}` : ''}`.toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * ponytail: fixed, rough USD rates — used only to filter/sort "prize ≥ X",
 * never shown as a converted amount. Ceiling: refresh by hand or plug in an
 * FX source if prize filters ever need precision.
 */
export const USD_PER_UNIT: Record<string, number> = {
  USD: 1, INR: 0.012, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, SGD: 0.74, JPY: 0.0067, AED: 0.27, CHF: 1.12, NGN: 0.00065, KES: 0.0077, BRL: 0.18,
}
const SYMBOLS: [RegExp, string][] = [
  [/₹|rs\.?\s|inr|fa-rupee/i, 'INR'], [/€|eur\b/i, 'EUR'], [/£|gbp\b/i, 'GBP'], [/c\$|cad\b/i, 'CAD'], [/a\$|aud\b/i, 'AUD'],
  [/s\$|sgd\b/i, 'SGD'], [/¥|jpy\b/i, 'JPY'], [/aed\b/i, 'AED'], [/chf\b/i, 'CHF'], [/\$|usd\b|us dollars?/i, 'USD'],
]

export function usdMinor(amountMinor: number | null, currency: string | null): number | null {
  if (amountMinor == null || !currency) return null
  const rate = USD_PER_UNIT[currency.toUpperCase()]
  return rate ? Math.round(amountMinor * rate) : null
}

/** Major-unit amount + ISO currency → Prize (integer minor units). */
export function prizeFromAmount(amount: number | null, currency: string | null, text?: string | null): Prize | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return text ? { text: text.slice(0, 80), amount_minor: null, currency: null, usd_minor: null } : null
  const cur = (currency || 'USD').toUpperCase()
  const minor = Math.round(amount * (cur === 'JPY' ? 1 : 100))
  const fmt = (() => {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(amount) } catch { return `${cur} ${Math.round(amount)}` }
  })()
  return { text: (text || `${fmt} in prizes`).slice(0, 80), amount_minor: minor, currency: cur, usd_minor: cur === 'JPY' ? usdMinor(minor * 100, cur) : usdMinor(minor, cur) }
}

/** "$10,000", "₹ 1,00,000", "INR 50000", "€5k", "USD 2.5M" → Prize. Strips HTML first. */
export function parsePrizeText(raw: unknown): Prize | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (!s) return null
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*([km]|lakh|lac|crore|million|thousand)?\b/i)
  if (!m) return null
  let n = Number(m[1].replace(/,/g, ''))
  const mult = (m[2] || '').toLowerCase()
  if (mult === 'k' || mult === 'thousand') n *= 1e3
  else if (mult === 'm' || mult === 'million') n *= 1e6
  else if (mult === 'lakh' || mult === 'lac') n *= 1e5
  else if (mult === 'crore') n *= 1e7
  const cur = SYMBOLS.find(([re]) => re.test(s))?.[1] || null
  if (!cur) return null
  return prizeFromAmount(n, cur)
}

// ─── Places ─────────────────────────────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  india: 'IN', 'united states': 'US', usa: 'US', 'united states of america': 'US', us: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB', scotland: 'GB',
  canada: 'CA', germany: 'DE', france: 'FR', spain: 'ES', italy: 'IT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH', austria: 'AT', ireland: 'IE',
  portugal: 'PT', poland: 'PL', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', greece: 'GR', romania: 'RO', ukraine: 'UA', turkey: 'TR', türkiye: 'TR',
  'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA', qatar: 'QA', israel: 'IL', egypt: 'EG', nigeria: 'NG', kenya: 'KE', ghana: 'GH',
  'south africa': 'ZA', morocco: 'MA', singapore: 'SG', malaysia: 'MY', indonesia: 'ID', philippines: 'PH', vietnam: 'VN', thailand: 'TH', japan: 'JP',
  'south korea': 'KR', korea: 'KR', china: 'CN', 'hong kong': 'HK', taiwan: 'TW', australia: 'AU', 'new zealand': 'NZ', pakistan: 'PK', bangladesh: 'BD',
  'sri lanka': 'LK', nepal: 'NP', brazil: 'BR', mexico: 'MX', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
}
const US_STATES = /^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/

export function countryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (/^[A-Z]{2}$/.test(s) && !US_STATES.test(s)) return s === 'UK' ? 'GB' : s
  return COUNTRY_NAMES[s.toLowerCase().replace(/[.]/g, '')] || null
}

/** "Hyderabad, India" / "Boston, MA" / "Online" → {city, country}. */
export function parseLocation(raw: unknown): { city: string | null; country: string | null } {
  if (typeof raw !== 'string' || !raw.trim() || /^(online|virtual|remote|digital|worldwide|global)$/i.test(raw.trim())) return { city: null, country: null }
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  const last = parts[parts.length - 1] || ''
  let country = countryCode(last)
  if (!country && US_STATES.test(last.toUpperCase()) && last.length === 2) country = 'US'
  const city = parts.length > 1 || !country ? (parts[0] || null) : null
  return { city: city ? city.slice(0, 80) : null, country }
}

// ─── Kind / mode / themes ───────────────────────────────────────────────────

export function inferKind(title: string, fallback: EventKind = 'hackathon'): EventKind {
  const t = title.toLowerCase()
  if (/buildathon|build[- ]?a?thon|build week/.test(t)) return 'buildathon'
  if (/\bctf\b|capture the flag/.test(t)) return 'ctf'
  if (/code[- ]?a?thon|coding contest|\bcontest\b|\bround\b|programming challenge|\bcup\b/.test(t)) return 'codeathon'
  if (/hack(athon|fest|day|night)?\b|hacks\b/.test(t)) return 'hackathon'
  if (/conference|summit|\bconf\b|devfest|meetup/.test(t)) return 'conference'
  return fallback
}

export function inferMode(o: { online?: unknown; onsite?: unknown; text?: unknown }): EventMode {
  const t = typeof o.text === 'string' ? o.text.toLowerCase() : ''
  if (/hybrid/.test(t)) return 'hybrid'
  if (o.online === true || /online|virtual|digital|remote/.test(t)) return o.onsite === true ? 'hybrid' : 'online'
  if (o.onsite === true || /in[- ]person|on[- ]?site|offline/.test(t)) return 'in_person'
  return o.online === false ? 'in_person' : 'online'
}

/** Our theme vocabulary (slugs) with the keywords that suggest each. */
export const THEME_KEYWORDS: Record<string, RegExp> = {
  'ai-ml': /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm|genai|generative|deep learning|nlp|computer vision|agents?)\b/i,
  web3: /\b(web3|blockchain|crypto|defi|ethereum|solana|nft|smart contracts?)\b/i,
  fintech: /\b(fintech|finance|banking|payments?|trading)\b/i,
  healthtech: /\b(health|healthcare|medical|medtech|biotech)\b/i,
  edtech: /\b(education|edtech|learning|students?)\b/i,
  climate: /\b(climate|sustainab\w*|green|energy|environment\w*|carbon)\b/i,
  'open-source': /\b(open[- ]source|oss|hacktoberfest)\b/i,
  mobile: /\b(mobile|android|ios|flutter|react native)\b/i,
  web: /\b(web|frontend|front-end|full[- ]?stack|javascript|react)\b/i,
  security: /\b(security|cyber\w*|ctf|infosec|pentest\w*)\b/i,
  data: /\b(data science|analytics|big data|data engineering|kaggle)\b/i,
  iot: /\b(iot|hardware|embedded|arduino|raspberry)\b/i,
  gaming: /\b(gam(e|es|ing)|game jam)\b/i,
  'social-good': /\b(social good|social impact|civic|ngo|non-?profit|accessibility)\b/i,
  cloud: /\b(cloud|aws|azure|gcp|devops|kubernetes|serverless)\b/i,
  'ar-vr': /\b(ar|vr|xr|augmented reality|virtual reality|metaverse)\b/i,
  robotics: /\b(robot\w*|drones?)\b/i,
  algorithms: /\b(algorithm\w*|competitive programming|dsa|codeforces|leetcode|codechef)\b/i,
  'beginner-friendly': /\b(beginners?|first[- ]timers?|newbies?|freshers?)\b/i,
}

export function slugTag(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** Map source tags + text onto our vocabulary (plus clean source tags), max 8. */
export function tagThemes(sourceTags: string[], text: string): string[] {
  const out = new Set<string>()
  const hay = `${sourceTags.join(' | ')} | ${text}`
  for (const [slug, re] of Object.entries(THEME_KEYWORDS)) if (re.test(hay)) out.add(slug)
  for (const t of sourceTags) {
    const s = slugTag(t)
    if (s && s.length >= 2 && out.size < 8 && !Object.keys(THEME_KEYWORDS).some((k) => k === s)) {
      // keep short, readable source tags we don't already cover
      if (s.length <= 24 && !/^(other|misc|general|none|open|n-a)$/.test(s)) out.add(s)
    }
  }
  return [...out].slice(0, 8)
}

// ─── Summary ────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<EventKind, string> = {
  hackathon: 'hackathon', codeathon: 'coding contest', buildathon: 'buildathon', ctf: 'CTF', competition: 'competition', conference: 'conference',
}

function fmtDay(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Our own one-paragraph summary from structured fields (no source text). */
export function fallbackSummary(e: Pick<ExternalEvent, 'kind' | 'mode' | 'organiser' | 'location' | 'starts_at' | 'ends_at' | 'prize' | 'themes' | 'registration_deadline'>): string {
  const mode = e.mode === 'online' ? 'Online' : e.mode === 'hybrid' ? 'Hybrid' : 'In-person'
  const where = e.mode !== 'online' && (e.location.city || e.location.country) ? ` in ${[e.location.city, e.location.country].filter(Boolean).join(', ')}` : ''
  const by = e.organiser ? ` by ${e.organiser}` : ''
  const a = fmtDay(e.starts_at)
  const b = fmtDay(e.ends_at)
  const when = a ? (b && b !== a ? ` Runs ${a} – ${b} (UTC).` : ` On ${a} (UTC).`) : ''
  const prize = e.prize?.text ? ` ${e.prize.text}.` : ''
  const themes = e.themes.length ? ` Themes: ${e.themes.slice(0, 4).join(', ')}.` : ''
  const reg = e.registration_deadline ? ` Registration closes ${fmtDay(e.registration_deadline)}.` : ''
  return `${mode} ${KIND_LABEL[e.kind]}${by}${where}.${when}${reg}${prize}${themes}`.replace(/\s+/g, ' ').trim().slice(0, 400)
}

// ─── Sanitise ───────────────────────────────────────────────────────────────

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '')

/** Validate + clip a connector result. Null when unusable (no title / link). */
export function sanitizeEvent(e: ExternalEvent): ExternalEvent | null {
  const title = clip(e.title, 200)
  const url = httpUrl(e.url)
  if (!title || !url || !e.source || !e.source_id) return null
  const starts = toUtcIso(e.starts_at)
  const ends = toUtcIso(e.ends_at)
  const out: ExternalEvent = {
    source: clip(e.source, 40),
    source_id: clip(String(e.source_id), 200),
    title,
    url,
    organiser: clip(e.organiser, 120) || null,
    kind: e.kind,
    mode: e.mode,
    location: { city: clip(e.location?.city, 80) || null, country: countryCode(e.location?.country) },
    starts_at: starts,
    ends_at: ends && starts && ends < starts ? starts : ends,
    registration_deadline: toUtcIso(e.registration_deadline),
    prize: e.prize && (e.prize.text || e.prize.amount_minor) ? {
      text: clip(e.prize.text, 80) || null,
      amount_minor: Number.isInteger(e.prize.amount_minor) && (e.prize.amount_minor as number) > 0 ? e.prize.amount_minor : null,
      currency: e.prize.currency && /^[A-Z]{3}$/.test(e.prize.currency) ? e.prize.currency : null,
      usd_minor: Number.isInteger(e.prize.usd_minor) && (e.prize.usd_minor as number) > 0 ? e.prize.usd_minor : null,
    } : null,
    themes: [...new Set((e.themes || []).map(slugTag).filter(Boolean))].slice(0, 8),
    image: httpUrl(e.image),
    description_summary: clip(e.description_summary, 600),
    raw_description: typeof e.raw_description === 'string' ? e.raw_description.slice(0, 8000) : null,
    featured: Boolean(e.featured),
    internal: Boolean(e.internal),
  }
  if (!out.description_summary) out.description_summary = fallbackSummary(out)
  return out
}
