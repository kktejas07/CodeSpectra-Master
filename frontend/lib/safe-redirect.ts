/**
 * Same-origin redirect guard — phishing defense.
 *
 * Login/signup/SSO flows accept a `?redirect=` (or `redirectTo`) target so
 * users land back where they came from. Without validation, an attacker can
 * craft `https://codespectra.ai/auth/login?redirectTo=https://evil-clone.example`
 * and the trusted domain in the URL bar funnels victims into a phishing
 * clone — exactly what Google Safe Browsing penalizes. Every auth redirect
 * in this codebase MUST go through this helper.
 */
export function safeRedirect(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || typeof raw !== 'string') return fallback
  const target = raw.trim()
  // Only same-origin absolute paths: must start with exactly one '/'
  // (rejects //evil.com, /\evil.com) and must not contain a scheme.
  if (!target.startsWith('/') || target.startsWith('//')) return fallback
  if (target.includes('://') || target.includes('\\')) return fallback
  // Control characters / whitespace tricks (e.g. "/\n/evil.com").
  if (/[\s\x00-\x1f]/.test(target)) return fallback
  return target
}
