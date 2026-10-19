/**
 * Permissions-Policy sent on every response (proxy.ts) and mirrored in
 * next.config.mjs for the identity-verify route.
 *
 * camera + microphone MUST be allowed for our own origin: AI mock voice mode,
 * speech-to-text answers, LiveKit live interviews, the proctoring audio
 * detector and the exam session recorder all call getUserMedia({ audio }).
 * `microphone=()` silently broke all of them (audit A-001 / A-033).
 * Third-party frames still get nothing; other powerful features stay off.
 */
export const PERMISSIONS_POLICY = [
  'camera=(self)',
  'microphone=(self)',
  'display-capture=(self)',
  'geolocation=(self)',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'hid=()',
  'midi=()',
  'interest-cohort=()',
].join(', ')

/** Parses a Permissions-Policy header into { feature: allowlist } (tests + diagnostics). */
export function parsePermissionsPolicy(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(',')) {
    const m = part.trim().match(/^([a-z-]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
