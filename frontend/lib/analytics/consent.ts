/**
 * Cookie / tracking consent (pure, client-safe).
 *
 * Categories:
 *   essential  — always on: sign-in, security, and anonymous page counts
 *                (no cookie, no stored id; a daily-rotating salted hash on the
 *                server tells same-day visits apart and cannot be reversed).
 *   analytics  — first-party analytics with a persistent random id + session,
 *                and third-party analytics tags (GA4, GTM, PostHog, Clarity).
 *   marketing  — ad / conversion tags (Meta Pixel, LinkedIn Insight).
 *
 * Browser privacy signals: Global Privacy Control (GPC) and Do Not Track (DNT)
 * switch marketing off for good and make "essential only" the default (no
 * banner). A visitor can still opt in to analytics from cookie settings.
 */

export const CONSENT_COOKIE = 'cs_consent'
export const CONSENT_VERSION = 1
/** Re-ask after a year (GDPR guidance; DPDP: consent must stay informed). */
export const CONSENT_MAX_AGE_DAYS = 365

export interface ConsentChoice {
  analytics: boolean
  marketing: boolean
  /** ISO time of the choice. */
  ts: string
}

export interface PrivacySignals {
  dnt: boolean
  gpc: boolean
}

export interface EffectiveConsent {
  analytics: boolean
  marketing: boolean
  /** Visitor (or a browser signal) has answered — no banner. */
  decided: boolean
  /** 'full' = persistent id allowed; 'anon' = counts only, nothing stored on the device. */
  mode: 'anon' | 'full'
}

/** Cookie value: `1.<a>.<m>.<epoch-seconds>` e.g. `1.1.0.1767225600`. */
export function serializeConsent(c: ConsentChoice): string {
  const secs = Math.floor((Date.parse(c.ts) || Date.now()) / 1000)
  return `${CONSENT_VERSION}.${c.analytics ? 1 : 0}.${c.marketing ? 1 : 0}.${secs}`
}

export function parseConsent(raw: string | null | undefined, now: Date = new Date()): ConsentChoice | null {
  const m = /^(\d+)\.([01])\.([01])\.(\d{9,11})$/.exec(String(raw || '').trim())
  if (!m || Number(m[1]) !== CONSENT_VERSION) return null
  const ms = Number(m[4]) * 1000
  if (ms > now.getTime() + 86_400_000 || now.getTime() - ms > CONSENT_MAX_AGE_DAYS * 86_400_000) return null
  return { analytics: m[2] === '1', marketing: m[3] === '1', ts: new Date(ms).toISOString() }
}

export function readSignals(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined, win?: { doNotTrack?: string | null }): PrivacySignals {
  const dntRaw = nav?.doNotTrack ?? win?.doNotTrack ?? null
  return { dnt: dntRaw === '1' || dntRaw === 'yes', gpc: nav?.globalPrivacyControl === true }
}

export function effectiveConsent(stored: ConsentChoice | null, signals: PrivacySignals): EffectiveConsent {
  const signal = signals.dnt || signals.gpc
  const analytics = stored ? stored.analytics : false
  const marketing = stored ? stored.marketing && !signal : false
  return { analytics, marketing, decided: !!stored || signal, mode: analytics ? 'full' : 'anon' }
}

export type TagCategory = 'analytics' | 'marketing'

export function canLoad(consent: EffectiveConsent, category: TagCategory): boolean {
  return category === 'analytics' ? consent.analytics : consent.marketing
}

/** Google Consent Mode v2 state for gtag / GTM. */
export function googleConsentState(c: EffectiveConsent): Record<string, 'granted' | 'denied'> {
  const a = c.analytics ? 'granted' : 'denied'
  const m = c.marketing ? 'granted' : 'denied'
  return { analytics_storage: a, ad_storage: m, ad_user_data: m, ad_personalization: m }
}

// ─── Browser helpers (no-ops on the server) ─────────────────────────────────

export const CONSENT_EVENT = 'cs:consent-change'
export const CONSENT_OPEN_EVENT = 'cs:consent-open'

export function readStoredConsent(): ConsentChoice | null {
  if (typeof document === 'undefined') return null
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
    return parseConsent(m ? decodeURIComponent(m[1]) : null)
  } catch {
    return null
  }
}

export function currentConsent(): EffectiveConsent {
  if (typeof window === 'undefined') return { analytics: false, marketing: false, decided: false, mode: 'anon' }
  return effectiveConsent(readStoredConsent(), readSignals(navigator as never, window as never))
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): EffectiveConsent {
  const c: ConsentChoice = { ...choice, ts: new Date().toISOString() }
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(c))}; Path=/; Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}; SameSite=Lax${secure}`
  } catch { /* cookies blocked — choice applies to this page only */ }
  const eff = currentConsent()
  const applied = readStoredConsent() ? eff : effectiveConsent(c, readSignals(navigator as never, window as never))
  try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: applied })) } catch { /* old browsers */ }
  return applied
}

/** Open the cookie settings dialog from anywhere (e.g. a footer link). */
export function openConsentSettings(): void {
  try { window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT)) } catch { /* noop */ }
}

/**
 * W4-18: server-side gate for handing conversions to third-party tags — a
 * valid cs_consent cookie with analytics, or marketing without a GPC signal.
 */
export function conversionsAllowed(cookieValue: string | null | undefined, gpcHeader: string | null | undefined, now: Date = new Date()): boolean {
  const c = parseConsent(cookieValue, now)
  if (!c) return false
  return c.analytics || (c.marketing && gpcHeader !== '1')
}
