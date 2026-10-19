/**
 * Client IP for rate limits, IP blocks, audit logs and captcha (SEC-021).
 *
 * `X-Forwarded-For`, `X-Real-IP` and `CF-Connecting-IP` are ordinary request
 * headers — anyone who reaches the app directly can set them. They are
 * honoured only when the *peer* (the address that actually connected to us)
 * is inside TRUSTED_PROXY_CIDRS (comma-separated CIDRs / IPs; default none).
 *
 * The peer comes from `x-codespectra-peer`, which scripts/server.mjs (the
 * production entry) overwrites with `req.socket.remoteAddress` on every
 * request and marks with CODESPECTRA_SOCKET_PEER=1 in its own process, so a
 * client can never supply it. Under plain `next start` the peer header is not
 * trusted; Next.js itself appends the socket address to X-Forwarded-For only
 * when the header is absent, so the right-most XFF hop is the best available
 * peer — safe only while the port is reachable solely through the reverse
 * proxy. `yarn start` therefore runs scripts/server.mjs too (W4-09); plain
 * `next start` is `start:next` and logs a one-time warning in production.
 *
 * W4-01: with TRUSTED_PROXY_CIDRS empty and a private/loopback/link-local peer
 * (local reverse proxy, Docker bridge gateway) exactly one XFF hop is trusted.
 *
 * CF-Connecting-IP additionally needs TRUST_CF_CONNECTING_IP=true, because a
 * Caddy/Nginx proxy that is not behind Cloudflare would pass a forged value
 * through untouched.
 *
 * Edge-safe: no node: imports. Mirrors backend/core/net.py.
 */

export const PEER_HEADER = 'x-codespectra-peer'

type Net = { v6: boolean; addr: bigint; bits: number }

function parseV4(s: string): bigint | null {
  const p = s.split('.')
  if (p.length !== 4) return null
  let n = BigInt(0)
  for (const part of p) {
    if (!/^\d{1,3}$/.test(part)) return null
    const v = Number(part)
    if (v > 255) return null
    n = (n << BigInt(8)) | BigInt(v)
  }
  return n
}

function parseV6(s: string): bigint | null {
  let str = s.toLowerCase()
  const pct = str.indexOf('%')
  if (pct >= 0) str = str.slice(0, pct)
  // embedded IPv4 tail (::ffff:1.2.3.4) → two hex groups
  const lastColon = str.lastIndexOf(':')
  if (str.includes('.') && lastColon >= 0) {
    const v4 = parseV4(str.slice(lastColon + 1))
    if (v4 === null) return null
    const hi = Number((v4 >> BigInt(16)) & BigInt(0xffff)).toString(16)
    const lo = Number(v4 & BigInt(0xffff)).toString(16)
    str = `${str.slice(0, lastColon + 1)}${hi}:${lo}`
  }
  const dbl = str.split('::')
  if (dbl.length > 2) return null
  const head = dbl[0] ? dbl[0].split(':') : []
  const rest = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : []
  let groups: string[]
  if (dbl.length === 2) {
    const fill = 8 - head.length - rest.length
    if (fill < 1) return null
    groups = [...head, ...Array(fill).fill('0'), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  let n = BigInt(0)
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    n = (n << BigInt(16)) | BigInt(parseInt(g, 16))
  }
  return n
}

/** Normalised IP string (v4-mapped v6 → v4), or null when not an IP. Accepts "ip:port" / "[v6]:port". */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let v = String(raw).trim().replace(/^"|"$/g, '')
  if (!v) return null
  if (v.startsWith('[')) {
    const end = v.indexOf(']')
    if (end < 0) return null
    v = v.slice(1, end)
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) {
    v = v.slice(0, v.lastIndexOf(':'))
  }
  if (parseV4(v) !== null) return v
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v)
  if (m && parseV4(m[1]) !== null) return m[1]
  const n = parseV6(v)
  if (n === null) return null
  // canonical-ish lower-case form; exact formatting does not matter for keys
  return v.toLowerCase()
}

function toNet(ip: string): { v6: boolean; addr: bigint } | null {
  const v4 = parseV4(ip)
  if (v4 !== null) return { v6: false, addr: v4 }
  const v6 = parseV6(ip)
  return v6 === null ? null : { v6: true, addr: v6 }
}

export function parseCidrs(raw: string | null | undefined): Net[] {
  const out: Net[] = []
  for (const part of String(raw || '').split(',')) {
    const item = part.trim()
    if (!item) continue
    const [ipPart, bitsPart] = item.split('/')
    const ip = normalizeIp(ipPart)
    if (!ip) continue
    const n = toNet(ip)
    if (!n) continue
    const max = n.v6 ? 128 : 32
    const bits = bitsPart === undefined ? max : Number(bitsPart)
    if (!Number.isInteger(bits) || bits < 0 || bits > max) continue
    out.push({ v6: n.v6, addr: n.addr, bits })
  }
  return out
}

export function ipInNets(ip: string | null, nets: Net[]): boolean {
  if (!ip) return false
  const n = toNet(ip)
  if (!n) return false
  return nets.some((net) => {
    if (net.v6 !== n.v6) return false
    const total = net.v6 ? 128 : 32
    const shift = BigInt(total - net.bits)
    return (n.addr >> shift) === (net.addr >> shift)
  })
}

let _cache: { raw: string; nets: Net[] } | null = null
export function trustedProxyNets(env: Record<string, string | undefined> = process.env): Net[] {
  const raw = env.TRUSTED_PROXY_CIDRS || ''
  if (!_cache || _cache.raw !== raw) _cache = { raw, nets: parseCidrs(raw) }
  return _cache.nets
}

export interface ClientIpOptions {
  nets?: Net[]
  trustCf?: boolean
  /** Is the peer header written by our own server (scripts/server.mjs)? */
  peerHeaderTrusted?: boolean
  /**
   * W4-01: with no TRUSTED_PROXY_CIDRS and a private/loopback/link-local peer
   * (a local reverse proxy or the Docker bridge gateway), trust exactly one
   * XFF hop — the right-most, which that proxy appended. Default true.
   */
  implicitLocalProxy?: boolean
}

let _warnedNoPeer = false
function warnNoSocketPeerOnce(env: Record<string, string | undefined>): void {
  if (_warnedNoPeer || env.NODE_ENV !== 'production') return
  _warnedNoPeer = true
  try {
    console.warn('[client-ip] running without scripts/server.mjs — client IPs come from X-Forwarded-For and can be forged if the port is exposed. Use `yarn start`.')
  } catch {
    /* ignore */
  }
}

let _warnedImplicit = false
function warnImplicitOnce(): void {
  if (_warnedImplicit) return
  _warnedImplicit = true
  try {
    console.warn(
      '[client-ip] TRUSTED_PROXY_CIDRS is empty but requests arrive from a private address; ' +
        'trusting one X-Forwarded-For hop from it. Set TRUSTED_PROXY_CIDRS to your reverse proxy / Docker gateway range ' +
        '(see docs/devops/06-Reverse-Proxy.md).',
    )
  } catch {
    /* ignore */
  }
}

/** Private / loopback / link-local / CGNAT address (v4 or v6)? */
export function isPrivateIp(ip: string | null | undefined): boolean {
  const n = normalizeIp(ip)
  if (!n) return false
  return ipInNets(n, PRIVATE_V4) || ipInNets(n, PRIVATE_V6)
}

type HeaderBag = { get(name: string): string | null }

/** The client IP, or 'unknown'. Pure given headers + options. */
export function resolveClientIp(headers: HeaderBag, opts: ClientIpOptions = {}): string {
  const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>)
  const nets = opts.nets ?? trustedProxyNets(env)
  const trustCf = opts.trustCf ?? /^(1|true|yes)$/i.test(env.TRUST_CF_CONNECTING_IP || '')
  const peerHeaderTrusted = opts.peerHeaderTrusted ?? env.CODESPECTRA_SOCKET_PEER === '1'

  const xffHops = (headers.get('x-forwarded-for') || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)

  let peer: string | null = null
  let hops = xffHops
  if (peerHeaderTrusted) {
    peer = normalizeIp(headers.get(PEER_HEADER))
  } else if (xffHops.length) {
    warnNoSocketPeerOnce(env)
    // Without our server, Next.js appends the socket address only when XFF was
    // absent, and a reverse proxy appends what it saw — so the right-most hop
    // is the nearest peer. Everything left of it is only as good as that peer.
    peer = normalizeIp(xffHops[xffHops.length - 1])
    hops = xffHops.slice(0, -1)
  }
  if (!peer) return 'unknown'
  if (!ipInNets(peer, nets)) {
    // W4-01: nothing configured, but the peer is clearly a local proxy →
    // one hop (the right-most, appended by that proxy). Public peer → itself.
    const implicit = opts.implicitLocalProxy ?? true
    if (implicit && nets.length === 0 && isPrivateIp(peer)) {
      const last = hops.length ? normalizeIp(hops[hops.length - 1]) : null
      if (last) {
        warnImplicitOnce()
        return last
      }
    }
    return peer
  }

  if (trustCf) {
    const cf = normalizeIp(headers.get('cf-connecting-ip'))
    if (cf) return cf
  }
  // Right-to-left: skip our own proxies; the first untrusted hop is the client.
  for (let i = hops.length - 1; i >= 0; i--) {
    const ip = normalizeIp(hops[i])
    if (!ip) break
    if (!ipInNets(ip, nets)) return ip
  }
  if (hops.length) {
    const first = normalizeIp(hops[0])
    if (first) return first
  }
  const real = normalizeIp(headers.get('x-real-ip'))
  return real || peer
}

export function clientIpFromRequest(req: { headers: HeaderBag } | null | undefined): string {
  if (!req) return 'unknown'
  return resolveClientIp(req.headers)
}

/** '' instead of 'unknown' — for audit/log fields that were previously empty when absent. */
export function clientIpOrEmpty(req: { headers: HeaderBag } | null | undefined): string {
  const ip = clientIpFromRequest(req)
  return ip === 'unknown' ? '' : ip
}

const PRIVATE_V4 = parseCidrs('0.0.0.0/8,10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.168.0.0/16')
const PRIVATE_V6 = parseCidrs('::1/128,fc00::/7,fe80::/10,::/128')

/**
 * May the system auto-block this IP? Never for 'unknown', private/loopback
 * addresses (that would be our own proxy or the whole LAN) or a trusted proxy.
 */
export function isAutoBlockableIp(ip: string | null | undefined, nets: Net[] = trustedProxyNets()): boolean {
  const n = normalizeIp(ip)
  if (!n) return false
  if (ipInNets(n, PRIVATE_V4) || ipInNets(n, PRIVATE_V6)) return false
  if (ipInNets(n, nets)) return false
  return true
}
