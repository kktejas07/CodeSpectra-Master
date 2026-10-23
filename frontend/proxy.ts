import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkCsrf, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf'
import { edgeRateLimit, edgeClientKey } from '@/lib/edge-rate-limit'
import { isCsrfExempt } from '@/lib/csrf-exempt'
import { isPublicMarketingPath } from '@/lib/seo/public-routes'
import { PERMISSIONS_POLICY } from '@/lib/security-headers'
import { TAG_CONNECT_HOSTS, TAG_FRAME_HOSTS, TAG_SCRIPT_HOSTS } from '@/lib/analytics/integrations'
import { cspHeaders, cspMode, makeNonce, type CspHeaderPlan } from '@/lib/csp/policy'
import { currentStorageOrigin } from '@/lib/csp/storage-origin'
import { publicHtmlCacheControl } from '@/lib/cache/cdn-headers'
import { bearerSkipsCsrf, corsAllowedOrigins, httpsRedirectUrl, impersonationBlocked, isPageRequestPath, loginCsrfBlocked } from '@/lib/request-guards'

// Optional analytics / ad tags (Admin → Settings → Analytics) load only after
// visitor consent (components/analytics/third-party-tags.tsx); their hosts are
// listed once in lib/analytics/integrations.ts. The CSP itself is built in
// lib/csp/policy.ts (static vs nonce variant, CSP_ENFORCE rollout flag).
const TAG_HOSTS = { script: TAG_SCRIPT_HOSTS, connect: TAG_CONNECT_HOSTS, frame: TAG_FRAME_HOSTS }

const HSTS = 'max-age=63072000; includeSubDomains; preload'

const SESSION_COOKIE = 'codespectra_session'

/**
 * Server check for every signed-in page (feature #10): the route → access map
 * in lib/page-access-map.ts decides; role / status / tenant come from the DB
 * via the session helper (short caches in lib/session and
 * lib/page-access-server). Signed out → /auth/login; locked, forbidden or
 * plan-gated → the branded /dashboard/locked page (rewrite, URL kept).
 * Returns null when the request may continue.
 */
async function pageGate(request: NextRequest, forward?: { request: { headers: Headers } }): Promise<NextResponse | null> {
  const { pathname, search } = request.nextUrl
  const { resolveRouteAccess, lockedPagePath } = await import('@/lib/page-access-map')
  const access = resolveRouteAccess(pathname)
  if (!access || access.auth === 'public') return null
  try {
    const { gatePageRequest } = await import('@/lib/page-access-server')
    const result = await gatePageRequest({
      pathname,
      sessionCookie: request.cookies.get(SESSION_COOKIE)?.value ?? null,
      authorization: request.headers.get('authorization'),
    })
    if (result.action === 'next') return null
    if (result.action === 'maintenance') return NextResponse.rewrite(new URL('/maintenance', request.url), forward)
    if (result.action === 'setup_2fa') {
      const url = new URL('/auth/two-factor-setup', request.url)
      url.searchParams.set('redirectTo', pathname + search)
      return NextResponse.redirect(url)
    }
    if (result.action === 'login') {
      const url = new URL('/auth/login', request.url)
      url.searchParams.set('redirectTo', pathname + search)
      return NextResponse.redirect(url)
    }
    return NextResponse.rewrite(new URL(lockedPagePath(result.reason, pathname, result.feature), request.url), forward)
  } catch (e) {
    // Fail closed: never render a guarded page we could not check.
    console.error('[proxy] page gate failed:', e)
    return NextResponse.rewrite(new URL(lockedPagePath('unavailable', pathname), request.url), forward)
  }
}

/** NextResponse.next() init that forwards the nonce'd CSP to the renderer. */
function withRequestCsp(request: NextRequest, value: string) {
  const headers = new Headers(request.headers)
  headers.set('content-security-policy', value)
  return { request: { headers } }
}

function isPageRequest(pathname: string): boolean {
  // SEC-016: only real asset extensions skip the page gate (lib/request-guards).
  return isPageRequestPath(pathname)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Force HTTPS when a TLS-terminating proxy forwarded a plain-http request.
  const httpsUrl = httpsRedirectUrl(request.url, request.headers)
  if (httpsUrl) {
    const redirect = NextResponse.redirect(httpsUrl, 308)
    redirect.headers.set('Strict-Transport-Security', HSTS)
    return redirect
  }

  // CSP for HTML pages only (not API/static responses). Public marketing /
  // content pages are static or ISR → the static variant; every other page is
  // rendered per request → a fresh nonce, handed to Next through the request
  // CSP header so it can stamp its own scripts (lib/csp/policy.ts).
  const isHtmlPage = !pathname.startsWith('/_next/') && !pathname.startsWith('/api/') && !pathname.includes('.')
  let csp: CspHeaderPlan | null = null
  if (isHtmlPage) {
    const variant = isPublicMarketingPath(pathname) ? 'static' : 'nonce'
    csp = cspHeaders({
      mode: cspMode(),
      variant,
      nonce: variant === 'nonce' ? makeNonce() : undefined,
      dev: process.env.NODE_ENV === 'development',
      tags: TAG_HOSTS,
      // Private-upload bucket (presigned PUT/GET), only when S3 is configured.
      storage: await currentStorageOrigin(),
    })
  }
  const forward = csp?.requestCsp ? withRequestCsp(request, csp.requestCsp) : undefined

  const response = (isPageRequest(pathname) ? await pageGate(request, forward) : null) ?? NextResponse.next(forward)

  // Global API rate limiting (best-effort edge layer). Generous threshold catches
  // only egregious abuse — per-route limits in Node handlers are the real guard.
  // Exempt paths: lib/csrf-exempt.ts (segment-aware).
  if (pathname.startsWith('/api/') && !isCsrfExempt(pathname)) {
    const rl = edgeRateLimit(`api:${edgeClientKey(request)}`, 240, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfterSec) },
        },
      )
    }
  }

  const secureFlag = process.env.NODE_ENV === 'production' ? 'Secure;' : ''

  if (pathname.startsWith('/api/')) {
    // SEC-012: CSRF-exempt sign-in endpoints accept JSON only, never cross-site
    // (blocks login-CSRF via a text/plain HTML form).
    if (loginCsrfBlocked(request.method, pathname, request.headers)) {
      return NextResponse.json({ error: 'Unsupported request' }, { status: 415 })
    }
    // SEC-010: an admin "viewing as" a user cannot change the account's
    // credentials, delete it, or move money (claim `imp` in the session JWT).
    if (impersonationBlocked(request.method, pathname, request.cookies.get(SESSION_COOKIE)?.value)) {
      return NextResponse.json({ error: 'Not available while viewing as another user. Stop impersonating first.' }, { status: 403 })
    }
    // SEC-029: an admin who owes 2FA gets no /api/admin/** at all, whatever
    // guard the route uses (lib/admin-api-2fa.ts; fails open to the route guard).
    const { isAdminApiPath, adminApi2faBlocked, ADMIN_2FA_BODY } = await import('@/lib/admin-api-2fa')
    if (isAdminApiPath(pathname)) {
      if (await adminApi2faBlocked({ sessionCookie: request.cookies.get(SESSION_COOKIE)?.value ?? null, authorization: request.headers.get('authorization') })) {
        return NextResponse.json(ADMIN_2FA_BODY, { status: 403 })
      }
    }
  }

  // CSRF protection for API routes (webhooks & web-vitals exempt — external callers use HMAC signatures, not CSRF tokens)
  if (pathname.startsWith('/api/') && !isCsrfExempt(pathname)) {
    // Bearer-authenticated callers (the mobile app, server-to-server clients)
    // carry no ambient cookie, so a CSRF token is neither present nor
    // meaningful — there is nothing to forge. Cross-site scripting cannot
    // mint a Bearer header the way it can replay a cookie, so these requests
    // skip the double-submit check and get a fresh cookie for later use.
    // SEC-025: …but only when no session cookie is present — getAPIUser
    // prefers the cookie, so a junk Bearer header must not unlock CSRF.
    const bearer = bearerSkipsCsrf(request.headers, !!request.cookies.get(SESSION_COOKIE)?.value)
    if (!bearer) {
      const csrf = checkCsrf(request)
      if (!csrf.pass) {
        return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
      }
      // Hand the browser a token so it can reuse it on later mutating calls.
      if (csrf.token) {
        response.headers.append(
          'Set-Cookie',
          `${CSRF_COOKIE}=${csrf.token}; Path=/; Max-Age=86400; SameSite=Lax; ${secureFlag}`,
        )
      }
    }
  }

  // Also set CSRF cookie on page loads so document.cookie can always read it
  // (Cloudflare Bot Fight Mode may intercept API calls before the cookie is set).
  // Not on public marketing/content pages or files (sitemaps, llms.txt, OG images):
  // a Set-Cookie there stops CDN caching (SEO-004), and csrfFetch bootstraps the
  // token on demand for the few public forms.
  if (isPageRequest(pathname) && !isPublicMarketingPath(pathname) && !request.cookies.get(CSRF_COOKIE)) {
    const token = crypto.getRandomValues(new Uint8Array(32))
    const hex = Array.from(token).map(b => b.toString(16).padStart(2, '0')).join('')
    response.headers.append(
      'Set-Cookie',
      `${CSRF_COOKIE}=${hex}; Path=/; Max-Age=86400; SameSite=Lax; ${secureFlag}`,
    )
  }

  // Security headers for ALL responses
  response.headers.set('Strict-Transport-Security', HSTS)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  // COOP disabled: same-origin-allow-popups blocks Firebase OAuth popup
  // window.closed calls. unsafe-none allows cross-origin popups to work.
  response.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-site')
  response.headers.set(
    'Permissions-Policy',
    // lib/security-headers.ts — camera + microphone allowed for self (voice
    // interviews, LiveKit, proctoring); geolocation=(self) for "Use live location".
    PERMISSIONS_POLICY,
  )

  // CORS — only allow known origins, never reflect arbitrary origins with credentials
  const origin = request.headers.get('origin')
  // Exact allowlist (lib/request-guards): codespectra.ai, NEXT_PUBLIC_APP_URL,
  // CORS_ALLOWED_ORIGINS; localhost only in development.
  const allowedOrigins = corsAllowedOrigins()
  const isAllowedOrigin = allowedOrigins.includes(origin || '')
  // Only set CORS headers for allowed origins; block disallowed origins
  if (isAllowedOrigin && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Max-Age', '86400')
  }

  if (csp) {
    for (const [k, v] of Object.entries(csp.response)) response.headers.set(k, v)
    response.headers.set('X-Frame-Options', 'DENY')
  }

  // SEO-004: public HTML (static CSP, no cookies) may be shared by the CDN even
  // when Next renders it per request (lib/cache/cdn-headers.ts).
  const cdnCache = publicHtmlCacheControl({ method: request.method, pathname, headers: request.headers, cookies: request.cookies })
  if (cdnCache && !response.headers.has('location')) response.headers.set('Cache-Control', cdnCache)

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
