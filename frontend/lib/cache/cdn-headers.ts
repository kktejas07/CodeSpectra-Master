/**
 * SEO-004: CDN caching for public HTML.
 *
 * DB-backed public pages (/, /pricing, /events, /learn, /news, /digest,
 * /contests, their /hi /te copies and detail pages) render per request from
 * the tag-purged data cache (lib/cache/public-data.ts) because the production
 * build has no database. Next marks those responses
 * `private, no-cache, no-store`, so Cloudflare would re-fetch every hit.
 *
 * They read no cookies, headers or session on the server
 * (tests/csp-dynamic-routes.test.ts) and use the static CSP variant (no
 * nonce), so the HTML is the same for every visitor and can be shared by the
 * CDN. proxy.ts sets this header before rendering; Next keeps a Cache-Control
 * that is already on the response (node_modules/next/dist/server/send-payload.js,
 * "allow users to customize it"), which the CDN guide
 * (node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md) relies on.
 *
 *  - Browsers: `max-age=0` → always revalidate (no stale page after sign-in).
 *  - CDN: 60 s fresh, then up to 10 min stale while it refetches in the
 *    background. Publishing purges the Next data cache by tag; the CDN copy
 *    follows within 60 s.
 *  - Only full HTML documents: RSC payloads / prefetches (`rsc`,
 *    `next-router-prefetch` headers), server actions, draft mode and
 *    non-GET/HEAD requests are left to Next.
 *  - PUBLIC_CDN_CACHE=0 turns it off (e.g. while debugging a stale page).
 * Edge-safe and pure (unit tested in tests/cdn-headers.test.ts).
 */
import { isPublicMarketingPath } from '@/lib/seo/public-routes'

export const PUBLIC_HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'

type HeaderBag = { get(name: string): string | null }
type CookieBag = { has(name: string): boolean }

export interface CdnCacheInput {
  method: string
  pathname: string
  headers: HeaderBag
  cookies?: CookieBag
  env?: Record<string, string | undefined>
}

export function publicHtmlCacheControl({ method, pathname, headers, cookies, env = process.env }: CdnCacheInput): string | null {
  if (env.PUBLIC_CDN_CACHE === '0') return null
  const m = method.toUpperCase()
  if (m !== 'GET' && m !== 'HEAD') return null
  // HTML documents only (files like /learn/rss.xml set their own headers).
  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/') || pathname.includes('.')) return null
  if (pathname === '/og' || !isPublicMarketingPath(pathname)) return null
  if (headers.get('rsc') || headers.get('next-router-prefetch') || headers.get('next-action')) return null
  if (cookies?.has('__prerender_bypass')) return null
  return PUBLIC_HTML_CACHE_CONTROL
}
