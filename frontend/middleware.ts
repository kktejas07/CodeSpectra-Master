import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkCsrf, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf'

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://apis.google.com https://www.gstatic.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "font-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.github.com https://*.razorpay.com https://api.razorpay.com https://checkout.razorpay.com wss://*.firebaseio.com",
  "frame-src 'self' blob: data: https://*.firebaseapp.com https://checkout.razorpay.com",
  "worker-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "child-src 'self' blob: data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ')

const HSTS = 'max-age=63072000; includeSubDomains; preload'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next()

  // CSRF protection for API routes (webhooks & web-vitals exempt — external callers use HMAC signatures, not CSRF tokens)
  const CSRF_EXEMPT = [
    '/api/analytics/web-vitals',
    '/api/github/webhook',
    '/api/billing/webhook',
    '/api/billing/stripe-webhook',
    '/api/billing/phonepe-webhook',
  ]
  if (pathname.startsWith('/api/') && !CSRF_EXEMPT.some(p => pathname.startsWith(p))) {
    const csrf = checkCsrf(request)
    if (!csrf.pass) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
    }
    if (csrf.token) {
      response.headers.append(
        'Set-Cookie',
        `${CSRF_COOKIE}=${csrf.token}; Path=/; Max-Age=86400; SameSite=Lax; Secure`,
      )
    }
  }

  // Security headers for ALL responses
  response.headers.set('Strict-Transport-Security', HSTS)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  )

  // CORS headers
  response.headers.set('Access-Control-Allow-Origin', request.headers.get('origin') || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Max-Age', '86400')

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
