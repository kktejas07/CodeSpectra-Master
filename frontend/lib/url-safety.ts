/**
 * URL safety utilities — SSRF protection.
 *
 * Before fetching any user-supplied URL, pass it through `isSafeUrl()` to
 * ensure the resolved host is not a private / loopback / link-local address
 * or the cloud metadata endpoint.
 */

type SafeUrlResult =
  | { safe: true; url: URL }
  | { safe: false; error: string }

/** IP ranges that must never be reached from server-side fetches. */
const BLOCKED_RANGES: Array<{ test: (addr: string) => boolean; label: string }> = [
  // Loopback
  { test: (a) => a === '127.0.0.1' || a === '::1' || a === '0.0.0.0', label: 'loopback' },
  // RFC 1918
  { test: (a) => /^10\./.test(a), label: '10.0.0.0/8' },
  { test: (a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a), label: '172.16.0.0/12' },
  { test: (a) => /^192\.168\./.test(a), label: '192.168.0.0/16' },
  // Link-local / metadata
  { test: (a) => /^169\.254\./.test(a), label: '169.254.169.254 (metadata)' },
  // IPv6 ULA
  { test: (a) => /^fc[0-9a-f]{2}:/i.test(a), label: 'fc00::/7 (ULA)' },
  { test: (a) => /^fd[0-9a-f]{2}:/i.test(a), label: 'fd00::/8 (ULA)' },
]

/**
 * Validate that a URL string is safe to fetch from the server.
 *
 * Checks:
 * - Valid URL parseable by the `URL` constructor
 * - Protocol is `http:` or `https:` only
 * - Resolved hostname does not resolve to a private / loopback / metadata IP
 *   (basic DNS check via `dns.lookup`; does NOT bypass DNS rebinding fully)
 * - No null-byte or control characters in the URL
 */
export async function isSafeUrl(rawUrl: string): Promise<SafeUrlResult> {
  // Block null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(rawUrl)) {
    return { safe: false, error: 'URL contains invalid control characters' }
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { safe: false, error: 'Invalid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { safe: false, error: `Protocol "${url.protocol}" is not allowed (use http/https)` }
  }

  // Resolve the hostname to check for private IPs
  const hostname = url.hostname
  // Allow fast-path for well-known public hosts (optional optimization)
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    return { safe: false, error: `Hostname "${hostname}" is blocked` }
  }

  try {
    const dns = await import('dns')
    const { promisify } = await import('util')
    const lookup = promisify(dns.lookup)
    const { address } = await lookup(hostname)
    for (const range of BLOCKED_RANGES) {
      if (range.test(address)) {
        return { safe: false, error: `Resolved IP ${address} is in a blocked range (${range.label})` }
      }
    }
  } catch {
    // DNS resolution failed — the host doesn't exist, so it's not reachable.
    // Still block it to avoid confusion.
    return { safe: false, error: `Could not resolve hostname "${hostname}"` }
  }

  return { safe: true, url }
}

/**
 * Synchronous check that blocks well-known private hostnames without DNS.
 * Use as a quick pre-check; `isSafeUrl()` does the full DNS validation.
 */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h === '[::1]') return true
  if (h.endsWith('.internal') || h.endsWith('.local')) return true
  return false
}
