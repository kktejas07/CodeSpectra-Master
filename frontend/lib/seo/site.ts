/**
 * Canonical public origin for SEO (canonical links, Open Graph URLs, sitemaps,
 * robots, JSON-LD, llms.txt). Client-safe: no DB access.
 *
 * Order: NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL (only when it is a real
 * public https origin, never localhost) → https://codespectra.ai. The admin
 * "Site URL" setting (lib/seo/settings) overrides this on the server through
 * resolveSiteUrl().
 */
export const DEFAULT_SITE_URL = 'https://codespectra.ai'
export const SITE_NAME = 'CodeSpectra'
export const SITE_TAGLINE = 'Skills assessments that shortlist for you'
export const SITE_DESCRIPTION =
  'Proctored, auto-scored skills assessments for software, CAD, QA and aptitude roles. CodeSpectra ranks every candidate so hiring teams review only the strongest.'

/** Normalise an origin: https URL without trailing slash, or null when unusable. */
export function normaliseOrigin(raw: string | null | undefined): string | null {
  const t = (raw || '').trim()
  if (!t) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

function isPublicOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.protocol === 'https:' && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname)
  } catch {
    return false
  }
}

export function getSiteUrl(): string {
  const explicit = normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  if (explicit) return explicit
  const app = normaliseOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (app && isPublicOrigin(app)) return app
  return DEFAULT_SITE_URL
}

/** Admin override (when valid) wins over env. */
export function resolveSiteUrl(override?: string | null): string {
  const o = normaliseOrigin(override)
  return o && isPublicOrigin(o) ? o : getSiteUrl()
}

/** Absolute URL for a path (or pass-through for an absolute URL). */
export function absoluteUrl(pathOrUrl: string, base: string = getSiteUrl()): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const p = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base.replace(/\/$/, '')}${p}`
}
