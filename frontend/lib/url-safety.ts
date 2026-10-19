/**
 * URL safety utilities — SSRF protection for every server-side fetch of a URL
 * that an admin, tenant or third party can influence.
 *
 *  - isBlockedAddress: an IP literal is private / loopback / link-local /
 *    multicast / reserved. IPv6 forms that embed an IPv4 address (IPv4-mapped
 *    in any spelling — `::ffff:7f00:1` is what WHATWG URL makes of
 *    `[::ffff:127.0.0.1]` —, IPv4-compatible, IPv4-translated, NAT64
 *    64:ff9b::/96 and 6to4 2002::/16) are unwrapped to IPv4 first.
 *  - isSafeUrl: scheme + every address the host resolves to.
 *  - safeFetch: isSafeUrl on every hop (redirects followed manually) AND the
 *    connection itself goes through a lookup that re-checks the resolved
 *    addresses, so DNS rebinding between the check and the connect can't
 *    reach an internal address.
 *  - readBodyCapped / readTextCapped: stream a body with a hard byte cap
 *    (never buffer an unbounded / chunked response first).
 *  - safePreview: a short, sanitised snippet of a remote answer for logs.
 */
import { isIP } from 'node:net'

type SafeUrlResult =
  | { safe: true; url: URL }
  | { safe: false; error: string }

// ─── Address classification (pure) ──────────────────────────────────────────

/** [first, last] inclusive IPv4 ranges (as uint32) that are never fetched. */
const V4_BLOCKED: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local / cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

function v4ToInt(a: string): number | null {
  const parts = a.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

const V4_RANGES = V4_BLOCKED.map(([base, bits]) => {
  const b = v4ToInt(base)!
  const size = 2 ** (32 - bits)
  return [b, b + size - 1] as const
})

function v4Blocked(n: number): boolean {
  return V4_RANGES.some(([lo, hi]) => n >= lo && n <= hi)
}

/** Parse an IPv6 literal into 8 16-bit groups (zone id dropped). null when invalid. */
export function parseIPv6(input: string): number[] | null {
  let s = input.toLowerCase().replace(/^\[|\]$/g, '')
  const pct = s.indexOf('%')
  if (pct >= 0) s = s.slice(0, pct)
  if (!s.includes(':')) return null
  // Embedded dotted IPv4 tail → two groups.
  const lastColon = s.lastIndexOf(':')
  const tail = s.slice(lastColon + 1)
  if (tail.includes('.')) {
    const n = v4ToInt(tail)
    if (n === null) return null
    s = `${s.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const toGroups = (h: string) => (h === '' ? [] : h.split(':'))
  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  const all = [...head, ...rest]
  if (all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  let groups: string[]
  if (halves.length === 2) {
    const fill = 8 - all.length
    if (fill < 1) return null
    groups = [...head, ...Array(fill).fill('0'), ...rest]
  } else {
    if (all.length !== 8) return null
    groups = all
  }
  return groups.map((g) => parseInt(g, 16))
}

/** The IPv4 address an IPv6 address carries (mapped / compatible / translated / NAT64 / 6to4), else null. */
export function embeddedIPv4(g: number[]): number | null {
  const v4 = (hi: number, lo: number) => ((hi << 16) >>> 0) + lo
  const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0)
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible, deprecated)
  if (zero(0, 5) && (g[5] === 0xffff || g[5] === 0)) return v4(g[6], g[7])
  // ::ffff:0:a.b.c.d (SIIT translated)
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return v4(g[6], g[7])
  // 64:ff9b::/96 (well-known NAT64 prefix)
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return v4(g[6], g[7])
  // 2002::/16 (6to4) carries the IPv4 in groups 1–2
  if (g[0] === 0x2002) return v4(g[1], g[2])
  return null
}

function v6Blocked(g: number[]): boolean {
  if (g.every((x) => x === 0)) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  const first = g[0]
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (first === 0x64 && g[1] === 0xff9b && g[2] === 1) return true // 64:ff9b:1::/48 local-use NAT64
  if (first === 0x2001 && g[1] === 0) return true // 2001::/32 Teredo (embedded IPv4 is obfuscated)
  if (first === 0x2001 && g[1] === 0x0db8) return true // documentation
  if (first === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true // 100::/64 discard
  return false
}

/**
 * True when an IP literal must not be fetched. IPv6 addresses that embed an
 * IPv4 address are judged by that IPv4 address. Non-IP strings → false
 * (hostnames are resolved and their addresses checked by isSafeUrl).
 */
export function isBlockedAddress(address: string): boolean {
  const a = String(address || '').trim().replace(/^\[|\]$/g, '')
  const kind = isIP(a.split('%')[0])
  if (kind === 4) {
    const n = v4ToInt(a)
    return n === null ? true : v4Blocked(n)
  }
  if (kind === 6) {
    const g = parseIPv6(a)
    if (!g) return true
    const v4 = embeddedIPv4(g)
    if (v4 !== null) return v4Blocked(v4)
    return v6Blocked(g)
  }
  return false
}

/**
 * Synchronous check that blocks well-known private hostnames without DNS.
 * Use as a quick pre-check; `isSafeUrl()` does the full DNS validation.
 */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.internal') || h.endsWith('.local')) return true
  if (isIP(h.replace(/^\[|\]$/g, ''))) return isBlockedAddress(h)
  return false
}

// ─── DNS ────────────────────────────────────────────────────────────────────

type LookupAll = (host: string) => Promise<Array<{ address: string; family: number }>>

const systemLookupAll: LookupAll = async (host) => {
  const dns = await import('node:dns')
  return dns.promises.lookup(host, { all: true, verbatim: true })
}
let lookupAll: LookupAll = systemLookupAll

/** Tests: swap the resolver (null restores the system one). */
export function __setLookupForTests(fn: LookupAll | null) {
  lookupAll = fn ?? systemLookupAll
}

/**
 * Validate that a URL string is safe to fetch from the server: http(s) only,
 * no control characters, no credentials, and EVERY address the host resolves
 * to is public.
 */
export async function isSafeUrl(rawUrl: string): Promise<SafeUrlResult> {
  if (typeof rawUrl !== 'string' || /[\x00-\x1f\x7f]/.test(rawUrl)) {
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
  if (url.username || url.password) return { safe: false, error: 'URLs with credentials are not allowed' }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isBlockedHostname(url.hostname)) return { safe: false, error: `Hostname "${url.hostname}" is blocked` }
  if (isIP(host)) return isBlockedAddress(host) ? { safe: false, error: 'URL points to a blocked address' } : { safe: true, url }
  let addrs: string[]
  try {
    addrs = (await lookupAll(host)).map((r) => r.address)
  } catch {
    return { safe: false, error: `Could not resolve hostname "${url.hostname}"` }
  }
  if (!addrs.length) return { safe: false, error: `Could not resolve hostname "${url.hostname}"` }
  if (addrs.some(isBlockedAddress)) return { safe: false, error: 'URL resolves to a blocked address' }
  return { safe: true, url }
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | Array<{ address: string; family: number }>, family?: number) => void

/**
 * net/tls `lookup` that refuses to connect when ANY resolved address is
 * blocked — the connection uses exactly the addresses checked here.
 */
export function guardedLookup(hostname: string, options: { all?: boolean; family?: number } | number | undefined, callback: LookupCb): void {
  const all = typeof options === 'object' && !!options?.all
  lookupAll(hostname).then((rows) => {
    const usable = rows.filter((r) => r && typeof r.address === 'string')
    if (!usable.length) return callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' }))
    if (usable.some((r) => isBlockedAddress(r.address))) {
      return callback(Object.assign(new Error('Blocked URL: host resolves to a blocked address'), { code: 'EBLOCKED' }))
    }
    if (all) return callback(null, usable.map((r) => ({ address: r.address, family: r.family })))
    callback(null, usable[0].address, usable[0].family)
  }, (e: NodeJS.ErrnoException) => callback(e))
}

function headersToObject(h: RequestInit['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  new Headers(h).forEach((v, k) => { out[k] = v })
  return out
}

function bodyToBuffer(b: RequestInit['body']): Buffer | null {
  if (b == null) return null
  if (typeof b === 'string') return Buffer.from(b)
  if (b instanceof URLSearchParams) return Buffer.from(b.toString())
  if (b instanceof ArrayBuffer) return Buffer.from(new Uint8Array(b))
  if (ArrayBuffer.isView(b)) return Buffer.from(b.buffer, b.byteOffset, b.byteLength)
  throw new Error('safeFetch: unsupported request body type')
}

/** One request over node:http(s) with the guarded lookup; returns a WHATWG Response. */
async function pinnedRequest(url: URL, init: RequestInit): Promise<Response> {
  const [{ request: httpRequest }, { request: httpsRequest }, { Readable }, zlib] = await Promise.all([
    import('node:http'), import('node:https'), import('node:stream'), import('node:zlib'),
  ])
  const method = (init.method || 'GET').toUpperCase()
  const body = bodyToBuffer(init.body)
  const headers = headersToObject(init.headers)
  if (!headers['accept-encoding']) headers['accept-encoding'] = 'gzip, deflate, br'
  if (body && !headers['content-length']) headers['content-length'] = String(body.length)
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      method,
      headers,
      lookup: guardedLookup as never,
      signal: init.signal ?? undefined,
    }, (res) => {
      const status = res.statusCode || 0
      const h = new Headers()
      for (const [k, v] of Object.entries(res.headers)) {
        if (v === undefined) continue
        if (Array.isArray(v)) v.forEach((x) => h.append(k, x))
        else h.set(k, String(v))
      }
      const enc = String(res.headers['content-encoding'] || '').toLowerCase()
      let stream: NodeJS.ReadableStream = res
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip())
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate())
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress())
      if (stream !== res) { h.delete('content-encoding'); h.delete('content-length') }
      const nullBody = method === 'HEAD' || status === 204 || status === 304 || (status >= 100 && status < 200)
      if (nullBody) res.resume()
      const webBody = nullBody ? null : (Readable.toWeb(stream as import('node:stream').Readable) as unknown as ReadableStream<Uint8Array>)
      try {
        const out = new Response(webBody, { status: status < 200 || status > 599 ? 502 : status, statusText: res.statusMessage, headers: h })
        Object.defineProperty(out, 'url', { value: url.toString() })
        resolve(out)
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

type Transport = (url: URL, init: RequestInit) => Promise<Response>
let transport: Transport = pinnedRequest
/** Tests: replace the network transport (null restores the guarded node:http(s) one). */
export function __setTransportForTests(fn: Transport | null) {
  transport = fn ?? pinnedRequest
}

/**
 * fetch() for an untrusted URL: every hop (redirects are followed manually,
 * up to `maxRedirects`) must pass isSafeUrl, and the TCP connection uses a
 * lookup that re-checks the resolved addresses (no DNS-rebinding window).
 * Throws on a blocked URL. A 303 (or 301/302 after POST) switches to GET.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let current = rawUrl
  let opts: RequestInit = { ...init }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await isSafeUrl(current)
    if (!check.safe) throw new Error(`Blocked URL: ${check.error}`)
    const res = await transport(check.url, opts)
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const loc = res.headers.get('location')
      if (!loc) return res
      await res.body?.cancel().catch(() => {})
      const next = new URL(loc, check.url)
      const m = (opts.method || 'GET').toUpperCase()
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && m === 'POST')) {
        const h = headersToObject(opts.headers)
        delete h['content-type']; delete h['content-length']
        opts = { ...opts, method: 'GET', body: undefined, headers: h }
      }
      // Never forward credentials to another origin.
      if (next.origin !== check.url.origin) {
        const h = headersToObject(opts.headers)
        delete h.authorization; delete h.cookie
        opts = { ...opts, headers: h }
      }
      current = next.toString()
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

// ─── Bodies ─────────────────────────────────────────────────────────────────

export class ResponseTooLarge extends Error {
  constructor(max: number) { super(`Response too large (over ${max} bytes)`) }
}

/**
 * Read at most `maxBytes` of a body, streaming. Over the cap: throws
 * ResponseTooLarge, or with `truncate` returns the first `maxBytes`. The rest
 * of the stream is cancelled, never downloaded.
 */
export async function readBodyCapped(res: Response, maxBytes: number, opts: { truncate?: boolean } = {}): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length') || 0)
  if (!opts.truncate && declared > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw new ResponseTooLarge(maxBytes)
  }
  if (!res.body) return new Uint8Array(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (total + value.byteLength > maxBytes) {
        if (!opts.truncate) throw new ResponseTooLarge(maxBytes)
        chunks.push(value.subarray(0, maxBytes - total))
        total = maxBytes
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return out
}

export async function readTextCapped(res: Response, maxBytes: number, opts: { truncate?: boolean } = {}): Promise<string> {
  return new TextDecoder().decode(await readBodyCapped(res, maxBytes, opts))
}

/** A short, log-safe preview of remote text: no markup, no control characters, single line. */
export function safePreview(text: string, max = 120): string {
  const s = String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? `${s.slice(0, max)}…` : s
}
