import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkCsrf, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf'
import { edgeRateLimit, edgeClientKey } from '@/lib/edge-rate-limit'

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https: http:",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.github.com https://*.razorpay.com https://api.razorpay.com https://checkout.razorpay.com wss://*.firebaseio.com https://i.ytimg.com https://*.r2.cloudflarestorage.com https://*.cloudflarestorage.com https://*.amazonaws.com https://s3.amazonaws.com https://storage.googleapis.com https://*.your-objectstorage.com",
  "frame-src 'self' blob: data: https://*.firebaseapp.com https://checkout.razorpay.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com",
  "worker-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "child-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "media-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ')

const HSTS = 'max-age=63072000; includeSubDomains; preload'

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next()

  // Global API rate limiting (best-effort edge layer). Generous threshold catches
  // only egregious abuse — per-route limits in Node handlers are the real guard.
  const CSRF_EXEMPT = [
    '/api/analytics/web-vitals',
    '/api/analytics/events',
    '/api/github/webhook',
    '/api/billing/webhook',
    '/api/billing/stripe-webhook',
    '/api/billing/phonepe-webhook',
    '/api/billing/phonepe-callback',
    // Cron endpoints authenticate with CRON_SECRET (server-to-server), not
    // browser cookies — CSRF tokens are meaningless here, and requiring them
    // breaks the admin "run now" self-fetch and external cron callers.
    '/api/cron/',
    '/api/webhooks/postal',
    '/api/admin/llm-test',
    '/api/proctor/events',
    '/api/daily-login',
    '/api/kyc/didit/webhook',
    '/api/auth/login-method',
    '/api/security/track',
    '/api/auth/face-enroll',
    '/api/auth/face-verify',
  ]
  if (pathname.startsWith('/api/') && !CSRF_EXEMPT.some(p => pathname.startsWith(p))) {
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

  // CSRF protection for API routes (webhooks & web-vitals exempt — external callers use HMAC signatures, not CSRF tokens)
  if (pathname.startsWith('/api/') && !CSRF_EXEMPT.some(p => pathname.startsWith(p))) {
    // Bearer-authenticated callers (the mobile app, server-to-server clients)
    // carry no ambient cookie, so a CSRF token is neither present nor
    // meaningful — there is nothing to forge. Cross-site scripting cannot
    // mint a Bearer header the way it can replay a cookie, so these requests
    // skip the double-submit check and get a fresh cookie for later use.
    const bearer = request.headers.get('authorization')?.startsWith('Bearer ') ?? false
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
  // (Cloudflare Bot Fight Mode may intercept API calls before the cookie is set)
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && !request.cookies.get(CSRF_COOKIE)) {
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
    // ponytail: geolocation=(self) so profile "Use live location" works on user gesture; empty () caused console Permissions-Policy violations
    'camera=(self), microphone=(), geolocation=(self), interest-cohort=()',
  )

  // CORS — only allow known origins, never reflect arbitrary origins with credentials
  const origin = request.headers.get('origin')
  const allowedOrigins = [
    'https://codespectra.ai',
    // localhost only in development
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
  ]
  const isAllowedOrigin = allowedOrigins.includes(origin || '')
  // Only set CORS headers for allowed origins; block disallowed origins
  if (isAllowedOrigin && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token')
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Max-Age', '86400')
  }

  // CSP only for HTML pages (not API/static responses)
  if (
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/api/') &&
    !pathname.includes('.')
  ) {
    response.headers.set('Content-Security-Policy', CSP)
    response.headers.set('X-Frame-Options', 'DENY')
  }

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
