/**
 * Small, pure request checks used by proxy.ts (unit tested in
 * tests/security-wave4.test.ts). Edge-safe: no node: imports.
 */

// ─── SEC-016: what counts as a static file ──────────────────────────────────
// Only real asset extensions skip the page gate. A dynamic segment with a dot
// (/dashboard/exams/a.b) is a page and must be gated.
const STATIC_EXT =
  /\.(?:js|mjs|cjs|map|css|json|txt|xml|webmanifest|ico|png|jpe?g|gif|webp|avif|svg|bmp|woff2?|ttf|otf|eot|mp3|mp4|webm|ogg|wav|m4a|pdf|wasm|bin|zip|csv|md|onnx|tflite|glb|gltf)$/i

export function isStaticFilePath(pathname: string): boolean {
  return STATIC_EXT.test(pathname)
}

export function isPageRequestPath(pathname: string): boolean {
  return !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && !isStaticFilePath(pathname)
}

// ─── SEC-012: login CSRF on session-establishing endpoints ──────────────────
// The CSRF-exempt sign-in endpoints (lib/csrf-exempt.ts); the others carry
// the double-submit token already.
export const SESSION_ESTABLISHING_PATHS: readonly string[] = [
  '/api/auth/login',
  '/api/auth/face-verify',
  '/api/auth/mobile-token',
]

type HeaderBag = { get(name: string): string | null }

/**
 * A cross-site HTML form can POST text/plain or urlencoded bodies without a
 * preflight; it cannot send application/json. Also refuse explicit cross-site
 * fetches (Sec-Fetch-Site). Native clients send JSON and no Sec-Fetch-Site.
 */
export function loginCsrfBlocked(method: string, pathname: string, headers: HeaderBag): boolean {
  if (method.toUpperCase() !== 'POST') return false
  if (!SESSION_ESTABLISHING_PATHS.some((p) => pathname === p)) return false
  const ct = (headers.get('content-type') || '').toLowerCase()
  if (!ct.startsWith('application/json')) return true
  const site = (headers.get('sec-fetch-site') || '').toLowerCase()
  return site === 'cross-site'
}

// ─── SEC-025: Bearer skips CSRF only when no cookie authenticates ───────────
export function bearerSkipsCsrf(headers: HeaderBag, hasSessionCookie: boolean): boolean {
  const bearer = (headers.get('authorization') || '').startsWith('Bearer ')
  return bearer && !hasSessionCookie
}

// ─── SEC-010: impersonated sessions cannot touch account / money routes ─────
export const IMPERSONATION_BLOCKED_PREFIXES: readonly string[] = [
  '/api/user/email-change',
  '/api/user/change-password',
  '/api/user/delete-account',
  '/api/user/2fa',
  '/api/user/phone-verify',
  '/api/auth/face-enroll',
  '/api/auth/face-login',
  '/api/auth/trusted-devices',
  '/api/billing/checkout',
  '/api/billing/create-order',
  '/api/billing/cancel',
  '/api/billing/payment-methods',
  '/api/billing/portal',
  '/api/billing/subscription',
  '/api/marketplace/checkout',
  '/api/marketplace/seller/payouts',
  '/api/admin/impersonate',
  // SEC-039 (audit 7): every other route that charges, refunds or changes a plan.
  '/api/billing/change-plan',
  '/api/billing/verify',
  '/api/billing/coupons',
  '/api/marketplace/orders',
  '/api/marketplace/seller/refunds',
  '/api/licences',
]

/**
 * SEC-039: whole money areas — every non-GET under these is refused while
 * impersonating, so a new billing route is covered without a list edit.
 * Provider webhooks / callbacks carry no session cookie, but stay exempt
 * explicitly so a stray cookie never blocks a payment notification.
 */
const IMPERSONATION_BLOCKED_AREAS: readonly string[] = ['/api/billing', '/api/marketplace/orders', '/api/pro-certs']
const MONEY_WEBHOOK = /\/(webhooks?|stripe-webhook|phonepe-webhook|phonepe-callback)(\/|$)/

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    const bin = atob(b64 + pad)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const v = JSON.parse(new TextDecoder().decode(bytes))
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * The `imp` (impersonating admin id) claim of a session JWT, *without*
 * verifying it. Only used to BLOCK: a forged token gains nothing, and a real
 * one can't drop the claim without breaking its signature.
 */
export function impersonatorOfToken(token: string | null | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payload = b64urlJson(parts[1])
  return payload && typeof payload.imp === 'string' && payload.imp ? payload.imp : null
}

export function impersonationBlocked(method: string, pathname: string, sessionToken: string | null | undefined): boolean {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false
  // Stopping an impersonation must always work.
  if (pathname === '/api/admin/impersonate/stop' || pathname.startsWith('/api/admin/impersonate/stop/')) return false
  const listed = IMPERSONATION_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const moneyArea = !MONEY_WEBHOOK.test(pathname) && IMPERSONATION_BLOCKED_AREAS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!listed && !moneyArea) return false
  return impersonatorOfToken(sessionToken) !== null
}

// ─── Wave 5: force HTTPS behind a TLS-terminating proxy ─────────────────────
// Caddy/Nginx/Cloudflare/Traefik (Dokploy) terminate TLS and pass the original
// scheme in X-Forwarded-Proto. A plain-http request is redirected (308 keeps
// the method and body). Direct container hits (health checks, no header) and
// localhost are left alone. Opt out with FORCE_HTTPS=0.
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?$/i

export function httpsRedirectUrl(
  url: string,
  headers: HeaderBag,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.NODE_ENV !== 'production' || env.FORCE_HTTPS === '0') return null
  const proto = (headers.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase()
  if (proto !== 'http') return null
  const host = (headers.get('x-forwarded-host') || headers.get('host') || '').split(',')[0].trim()
  if (!host || LOCAL_HOST.test(host) || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return null
  }
  if (target.pathname === '/api/health') return null
  return `https://${host.replace(/:80$/, '')}${target.pathname}${target.search}`
}

// ─── Wave 5: CORS allowlist ─────────────────────────────────────────────────
// Exact-origin allowlist; never '*' with credentials. Production origin, the
// configured app URL, plus CORS_ALLOWED_ORIGINS (comma-separated https
// origins); localhost only in development.
export function corsAllowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const out = new Set<string>(['https://codespectra.ai'])
  const add = (raw: string | undefined) => {
    if (!raw) return
    try {
      const u = new URL(raw.trim())
      if (u.protocol === 'https:' || (env.NODE_ENV === 'development' && u.protocol === 'http:')) out.add(u.origin)
    } catch {
      /* ignore malformed entries */
    }
  }
  add(env.NEXT_PUBLIC_APP_URL)
  for (const o of (env.CORS_ALLOWED_ORIGINS || '').split(',')) add(o)
  if (env.NODE_ENV === 'development') {
    out.add('http://localhost:3000')
    out.add('http://localhost:3001')
  }
  return [...out]
}
