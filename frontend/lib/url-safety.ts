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
  // Loopback / unspecified
  { test: (a) => /^127\./.test(a) || a === '::1' || a === '::' || /^0\./.test(a), label: 'loopback' },
  // RFC 1918
  { test: (a) => /^10\./.test(a), label: '10.0.0.0/8' },
  { test: (a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a), label: '172.16.0.0/12' },
  { test: (a) => /^192\.168\./.test(a), label: '192.168.0.0/16' },
  // Carrier-grade NAT
  { test: (a) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a), label: '100.64.0.0/10' },
  // Link-local / metadata
  { test: (a) => /^169\.254\./.test(a), label: '169.254.169.254 (metadata)' },
  { test: (a) => /^fe[89ab][0-9a-f]:/i.test(a), label: 'fe80::/10 (link-local)' },
  // IPv6 ULA
  { test: (a) => /^fc[0-9a-f]{2}:/i.test(a), label: 'fc00::/7 (ULA)' },
  { test: (a) => /^fd[0-9a-f]{2}:/i.test(a), label: 'fd00::/8 (ULA)' },
]

/** True when an IP literal is private / loopback / link-local / metadata (IPv4-mapped IPv6 unwrapped). */
export function isBlockedAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, '')
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a)
  const addr = mapped ? mapped[1] : a
  return BLOCKED_RANGES.some((r) => r.test(addr))
}

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
    // Check every address the name resolves to, not just the first.
    const results = (await lookup(hostname.replace(/^\[|\]$/g, ''), { all: true })) as unknown as Array<{ address: string }>
    const addrs = Array.isArray(results) ? results.map((r) => r.address) : []
    if (addrs.length === 0) return { safe: false, error: `Could not resolve hostname "${hostname}"` }
    for (const address of addrs) {
      if (isBlockedAddress(address)) {
        return { safe: false, error: 'URL resolves to a blocked address' }
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

/**
 * fetch() for an untrusted URL: every hop (including redirects, followed
 * manually up to `maxRedirects`) must pass isSafeUrl. Throws on a blocked URL.
 * ponytail: DNS is checked before connecting, so DNS rebinding between the
 * check and the connect is not fully closed; good enough for scrapers.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await isSafeUrl(current)
    if (!check.safe) throw new Error(`Blocked URL: ${check.error}`)
    const res = await fetch(check.url.toString(), { ...init, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      current = new URL(loc, check.url).toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}
