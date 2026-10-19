/**
 * API paths that skip the proxy's CSRF double-submit check and global API
 * rate limit (webhooks with HMAC, cron with CRON_SECRET, session-establishing
 * login/token endpoints, public config). Matching is segment-aware: an entry
 * covers itself and its sub-paths only, so `/api/auth/login` does NOT exempt
 * `/api/auth/login-method`.
 */
export const CSRF_EXEMPT: readonly string[] = [
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
  '/api/cron',
  '/api/webhooks/postal',
  '/api/admin/llm-test',
  '/api/proctor/events',
  '/api/daily-login',
  '/api/kyc/didit/webhook',
  // ATS bot screening webhooks (Meta HMAC, Vapi secret, Twilio signature, Exotel token)
  '/api/ats/screening/webhooks',
  // ATS background-check vendor webhooks (Checkr X-Checkr-Signature HMAC)
  '/api/ats/bgv/webhooks',
  '/api/security/track',
  // Face sign-in starts a sign-in (no session yet), like /api/auth/login.
  '/api/auth/face-verify',
  // Login/token endpoints ESTABLISH the session, so there is no session to
  // forge — and cookie-less native clients cannot obtain a CSRF token
  // before their first call. Brute-force/IP protections live in the routes.
  '/api/auth/login',
  '/api/auth/mobile-token',
  // Public runtime config (GET, no cookies) — read before any session exists.
  '/api/config/public',
]

export function isCsrfExempt(pathname: string, exempt: readonly string[] = CSRF_EXEMPT): boolean {
  return exempt.some((p) => {
    const base = p.replace(/\/+$/, '')
    return pathname === base || pathname.startsWith(base + '/')
  })
}
