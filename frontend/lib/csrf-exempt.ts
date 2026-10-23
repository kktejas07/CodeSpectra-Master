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
  // First-party analytics beacons (sendBeacon can't set headers; nothing here acts for the user).
  '/api/analytics/collect',
  // CSP violation reports: browsers send them without cookies or headers (own rate limit, redacted logs).
  '/api/csp-report',
  '/api/github/webhook',
  '/api/billing/webhook',
  '/api/billing/stripe-webhook',
  '/api/billing/phonepe-webhook',
  '/api/billing/phonepe-callback',
  // Marketplace payment callbacks (PhonePe X-VERIFY checksum / Stripe signature; browser return re-checks status).
  '/api/marketplace/webhooks',
  // Certification attempt payment callbacks (same checks as the marketplace; settled from gateway status only).
  '/api/pro-certs/webhooks',
  // One-click unsubscribe from the weekly hiring digest (HMAC token per recipient; mail clients POST without cookies).
  '/api/ats/analytics/digest/unsubscribe',
  // Cron endpoints authenticate with CRON_SECRET (server-to-server), not
  // browser cookies — CSRF tokens are meaningless here, and requiring them
  // breaks the admin "run now" self-fetch and external cron callers.
  '/api/cron',
  '/api/webhooks/postal',
  '/api/proctor/events',
  '/api/daily-login',
  '/api/kyc/didit/webhook',
  // ATS bot screening webhooks (Meta HMAC, Vapi secret, Twilio signature, Exotel token)
  '/api/ats/screening/webhooks',
  // ATS background-check vendor webhooks (Checkr X-Checkr-Signature HMAC, AuthBridge HMAC, IDfy URL token + IP allow-list)
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
  // Workflow inbound webhooks (per-workflow HMAC X-CodeSpectra-Signature) and
  // signed one-click unsubscribe links in automated emails (HMAC token in the URL).
  '/api/workflows/hooks',
  '/api/automation/unsubscribe',
  // Guardian report one-click unsubscribe (HMAC token per link in the URL; mail clients POST without cookies).
  '/api/guardian/unsubscribe',
  // LTI 1.3 OIDC login + launch: cross-site form posts from the LMS, authenticated by the single-use state, nonce and the platform-signed id_token.
  '/api/lti/login',
  '/api/lti/launch',
  // Deep-link picker form (plain HTML form inside the LMS dialog); authorised by the single-use, unguessable launch token in the path.
  '/api/lti/deep-link',
]

export function isCsrfExempt(pathname: string, exempt: readonly string[] = CSRF_EXEMPT): boolean {
  return exempt.some((p) => {
    const base = p.replace(/\/+$/, '')
    return pathname === base || pathname.startsWith(base + '/')
  })
}
