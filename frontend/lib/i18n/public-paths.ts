/**
 * Locale-prefixed public pages (pure, client-safe; unit-tested in
 * tests/i18n-public-paths.test.ts).
 *
 * English keeps its unprefixed URLs (no redirects, SEO unchanged). Hindi and
 * Telugu copies of the public marketing / hub pages live under /hi/… and
 * /te/… (app/[lang]/…, prerendered or cached per locale like the English
 * page). Nothing ever redirects by Accept-Language: a first-time visitor
 * whose browser prefers hi / te gets a dismissible banner instead.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config'

/** Locales that get a URL prefix (English is the unprefixed default). */
export const PREFIXED_LOCALES = LOCALES.filter((l): l is Exclude<Locale, 'en'> => l !== DEFAULT_LOCALE)
export type PrefixedLocale = (typeof PREFIXED_LOCALES)[number]

export function isPrefixedLocale(v: unknown): v is PrefixedLocale {
  return typeof v === 'string' && (PREFIXED_LOCALES as readonly string[]).includes(v)
}

/** Public pages that exist in every language (exact paths). */
export const LOCALIZED_PATHS = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/faq',
  '/contact',
  '/support',
  '/privacy',
  '/terms',
  '/cookies',
  '/companies',
  '/learn',
  '/news',
  '/events',
  '/contests',
  '/leagues',
  '/mentors',
  '/marketplace',
  '/certifications',
  '/community',
] as const

/** Sections whose detail pages are localized too (/companies/<slug>). */
export const LOCALIZED_PREFIXES = ['/companies/', '/certifications/', '/community/c/', '/community/t/'] as const

/** hreflang codes per locale (+ x-default → English). */
export const HREFLANG: Record<Locale, string> = { en: 'en', hi: 'hi', te: 'te' }

function cleanPath(path: string): string {
  const p = (path || '/').split('#')[0].split('?')[0] || '/'
  const withSlash = p.startsWith('/') ? p : `/${p}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/'
}

/** True when `path` (unprefixed, query ignored) has Hindi / Telugu versions. */
export function isLocalizedPath(path: string): boolean {
  const p = cleanPath(path)
  if ((LOCALIZED_PATHS as readonly string[]).includes(p)) return true
  return LOCALIZED_PREFIXES.some((pre) => p.startsWith(pre) && /^[a-z0-9-]+$/.test(p.slice(pre.length)))
}

/** "/hi/pricing?x=1" → { locale: 'hi', path: '/pricing?x=1' }; unprefixed → English. */
export function splitLocalePath(pathname: string): { locale: Locale; path: string } {
  const raw = pathname || '/'
  const m = /^\/(hi|te)(?=\/|\?|#|$)(.*)$/.exec(raw)
  if (!m || !isPrefixedLocale(m[1])) return { locale: DEFAULT_LOCALE, path: raw.startsWith('/') ? raw : `/${raw}` }
  const rest = m[2] || ''
  const path = rest === '' || rest.startsWith('?') || rest.startsWith('#') ? `/${rest}` : rest
  return { locale: m[1], path }
}

/**
 * URL of `path` in `locale`. Only pages that have a translation get a prefix;
 * anything else (jobs, docs, the app) stays on its English URL. Query string
 * and hash are kept.
 */
export function localizedPath(path: string, locale: Locale): string {
  const { path: base } = splitLocalePath(path)
  if (locale === DEFAULT_LOCALE || !isLocalizedPath(base)) return base
  const cut = base.search(/[?#]/)
  const pathname = cut === -1 ? base : base.slice(0, cut)
  const tail = cut === -1 ? '' : base.slice(cut)
  return `${pathname === '/' ? `/${locale}` : `/${locale}${pathname}`}${tail}`
}

/**
 * Where the language switcher goes from the current URL: the same page in
 * the other language (/pricing ↔ /hi/pricing ↔ /te/pricing). Pages without a
 * translation stay where they are (the choice is still remembered).
 */
export function switchLocaleHref(currentPath: string, target: Locale): string {
  return localizedPath(splitLocalePath(currentPath).path, target)
}

/**
 * hreflang map for a localized page (Next metadata `alternates.languages`):
 * every language plus x-default → English. Null for pages with no
 * translation (they keep a plain canonical).
 */
export function hreflangAlternates(path: string): Record<string, string> | null {
  const base = cleanPath(splitLocalePath(path).path)
  if (!isLocalizedPath(base)) return null
  const out: Record<string, string> = {}
  for (const l of LOCALES) out[HREFLANG[l]] = localizedPath(base, l)
  out['x-default'] = base
  return out
}

/** `<link rel="alternate" hreflang>` rows for an XML sitemap entry (absolute URLs). */
export function sitemapAlternates(path: string, site: string): { hreflang: string; href: string }[] {
  const langs = hreflangAlternates(path)
  if (!langs) return []
  return Object.entries(langs).map(([hreflang, p]) => ({ hreflang, href: `${site}${p}` }))
}
