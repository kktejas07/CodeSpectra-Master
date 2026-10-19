/**
 * Privacy helpers for first-party analytics (pure, client-safe, no I/O).
 *
 * - Private pages (token links, test taking, checkout payment steps) are
 *   collapsed to a route template and counted without any identifier.
 * - Bots are dropped. Device class / browser / OS come from the user agent;
 *   the user agent itself is never stored.
 */

/** [pattern, template]. A match means "count the page view only, no ids, no referrer, no events". */
export const PRIVATE_ROUTES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/bgv(\/|$)/, '/bgv/[token]'],
  [/^\/hr-form(\/|$)/, '/hr-form/[token]'],
  [/^\/interview\/join(\/|$)/, '/interview/join/[token]'],
  [/^\/interview\/schedule(\/|$)/, '/interview/schedule/[token]'],
  [/^\/hiring-invite(\/|$)/, '/hiring-invite/[token]'],
  [/^\/assessment\/invite(\/|$)/, '/assessment/invite/[token]'],
  [/^\/assessment\/(?!demo(\/|$))[^/]+/, '/assessment/[id]'],
  [/^\/marketplace\/checkout(\/|$)/, '/marketplace/checkout'],
  [/^\/dashboard\/billing\/checkout(\/|$)/, '/dashboard/billing/checkout'],
  [/^\/dashboard\/interviews\/[^/]+\/live(\/|$)/, '/dashboard/interviews/[id]/live'],
  [/^\/auth\/reset-password(\/|$)/, '/auth/reset-password'],
  [/^\/qr(\/|$)/, '/qr/[token]'],
  [/^\/subscriptions\/(confirm|manage)(\/|$)/, '/subscriptions/[token]'],
  [/^\/certificate-preview(\/|$)/, '/certificate-preview'],
]

/** Strip query/hash, collapse slashes, cap length. Always starts with '/'. */
export function cleanPath(raw: string | null | undefined): string {
  let p = String(raw || '/').trim()
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname
  } catch { p = '/' }
  p = p.split(/[?#]/)[0] || '/'
  p = ('/' + p).replace(/\/{2,}/g, '/')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p.slice(0, 300)
}

export function privateRoute(path: string): string | null {
  const p = cleanPath(path)
  for (const [re, tpl] of PRIVATE_ROUTES) if (re.test(p)) return tpl
  return null
}

export function isPrivatePath(path: string): boolean {
  return privateRoute(path) !== null
}

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|twitterbot|pinterest|vkshare|w3c_validator|headlesschrome|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|curl\/|wget\/|python-requests|python-urllib|httpclient|okhttp|go-http-client|java\/|axios\/|node-fetch|scrapy|ahrefs|semrush|mj12bot|dotbot|petalbot|yandex|baiduspider|duckduckbot|applebot|gptbot|claudebot|ccbot|bytespider|perplexity/i

export function isBot(ua: string | null | undefined): boolean {
  const s = String(ua || '').trim()
  if (s.length < 12) return true
  return BOT_RE.test(s)
}

export type DeviceClass = 'mobile' | 'tablet' | 'desktop'

export function deviceClass(ua: string | null | undefined): DeviceClass {
  const s = String(ua || '')
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'tablet'
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini/i.test(s)) return 'mobile'
  return 'desktop'
}

export function browserFamily(ua: string | null | undefined): string {
  const s = String(ua || '')
  if (/Edg\//.test(s)) return 'Edge'
  if (/OPR\/|Opera/.test(s)) return 'Opera'
  if (/SamsungBrowser/.test(s)) return 'Samsung Internet'
  if (/Firefox\//.test(s)) return 'Firefox'
  if (/Chrome\/|CriOS/.test(s)) return 'Chrome'
  if (/Safari\//.test(s)) return 'Safari'
  return 'Other'
}

export function osFamily(ua: string | null | undefined): string {
  const s = String(ua || '')
  if (/Android/.test(s)) return 'Android'
  if (/iPhone|iPad|iPod/.test(s)) return 'iOS'
  if (/Windows/.test(s)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(s)) return 'macOS'
  if (/CrOS/.test(s)) return 'ChromeOS'
  if (/Linux/.test(s)) return 'Linux'
  return 'Other'
}

/** Referrer → host ('google.com'), or '' for none / same site / unparseable. */
export function referrerHost(referrer: string | null | undefined, ownHost?: string | null): string {
  const r = String(referrer || '').trim()
  if (!r) return ''
  try {
    const host = new URL(r).hostname.toLowerCase().replace(/^www\./, '')
    const own = String(ownHost || '').toLowerCase().replace(/^www\./, '').split(':')[0]
    if (own && (host === own || host.endsWith('.' + own))) return ''
    return host.slice(0, 120)
  } catch {
    return ''
  }
}

/** Acquisition source for a session: utm_source wins, then referrer host, else 'direct'. */
export function sourceOf(utmSource: string | null | undefined, refHost: string | null | undefined): string {
  const u = String(utmSource || '').trim().toLowerCase()
  if (u) return u.slice(0, 80)
  return refHost ? refHost : 'direct'
}

/** Prop keys that may carry personal data — dropped from custom event props. */
const PII_KEY = /(e-?mail|phone|mobile|name|address|token|password|secret|otp|card|pan|aadhaar|ssn|dob|birth|ip)$/i

export type PropValue = string | number | boolean | null

/** Keep ≤ 20 primitive props, drop PII-looking keys and values that look like emails / phone numbers. */
export function scrubProps(props: Record<string, unknown> | null | undefined): Record<string, PropValue> | undefined {
  if (!props || typeof props !== 'object') return undefined
  const out: Record<string, PropValue> = {}
  let n = 0
  for (const [k, v] of Object.entries(props)) {
    if (n >= 20) break
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(k) || PII_KEY.test(k)) continue
    if (v === null || typeof v === 'boolean') out[k] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'string') {
      const s = v.slice(0, 200)
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(s) || /\+?\d[\d\s-]{8,}\d/.test(s)) continue
      out[k] = s
    } else continue
    n++
  }
  return n ? out : undefined
}

/** Two-letter country from CDN headers (Cloudflare, Vercel, generic). Never the IP. */
export function countryFromHeaders(h: { get(name: string): string | null }): string | null {
  const c = (h.get('cf-ipcountry') || h.get('x-vercel-ip-country') || h.get('x-country-code') || h.get('cloudfront-viewer-country') || '').trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null
}
