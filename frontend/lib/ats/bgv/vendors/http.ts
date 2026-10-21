/**
 * Outbound HTTP for India BGV vendors (IDfy, AuthBridge). Base URLs are
 * admin-configurable, so every call goes through safeFetch (SSRF guard: public
 * hosts only, re-checked at connect time) with redirects OFF — a redirect could
 * otherwise carry the vendor credential headers to another origin.
 *
 * Nothing here logs: request bodies hold candidate data and headers hold
 * credentials. Errors carry only the vendor's short error text (clipped).
 */
import { VendorError } from './types'

export type VendorTransport = (url: string, init: RequestInit) => Promise<Response>

const defaultTransport: VendorTransport = async (url, init) => {
  const { safeFetch } = await import('@/lib/url-safety')
  return safeFetch(url, init, 0)
}
let transport: VendorTransport = defaultTransport

/** Tests: replace the network (null restores safeFetch). */
export function __setVendorTransportForTests(fn: VendorTransport | null) {
  transport = fn ?? defaultTransport
}

export const VENDOR_TIMEOUT_MS = 20_000
const MAX_BODY = 2_000_000

/** https only; path joined without double slashes. Pure. */
export function joinUrl(base: string, path: string): string {
  const b = String(base || '').replace(/\/+$/, '')
  const p = String(path || '').replace(/^\/+/, '')
  return p ? `${b}/${p}` : b
}

/** Admin-entered base URL: https, no credentials, no query / fragment. Pure; null when unusable. */
export function cleanBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null
    return u.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

/** Admin-entered relative path ("/v1/checks/pan"): no scheme, no "..", ≤ 200 chars. Pure; '' when unusable. */
export function cleanPath(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const p = raw.trim()
  if (!p || p.length > 200 || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//') || /(^|\/)\.\.(\/|$)/.test(p) || /[\s\\#]/.test(p)) return ''
  return p.startsWith('/') ? p : `/${p}`
}

/** Short vendor error text for people (never the whole body). Pure. */
export function vendorErrorText(j: unknown, fallback: string): string {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  const e = o.message ?? o.error_description ?? o.error ?? o.status_message ?? (o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>).message : null)
  const s = typeof e === 'string' ? e : fallback
  return s.replace(/[\r\n\t]+/g, ' ').slice(0, 200)
}

export interface VendorResponse {
  status: number
  body: unknown
}

/** One call; JSON (or form) in, JSON out. Throws VendorError on network errors and (unless allowStatus) non-2xx. */
export async function vendorRequest(vendor: string, label: string, url: string, init: RequestInit, opts: { allowStatus?: number[] } = {}): Promise<VendorResponse> {
  let res: Response
  try {
    res = await transport(url, { ...init, signal: init.signal ?? AbortSignal.timeout(VENDOR_TIMEOUT_MS) })
  } catch (e) {
    const msg = e instanceof Error && /Blocked URL/.test(e.message) ? 'the base URL is not allowed (public https hosts only)' : 'could not reach the vendor'
    throw new VendorError(vendor, `${label}: ${msg}`, 502)
  }
  const text = await res.text().catch(() => '')
  let body: unknown = null
  if (text && text.length <= MAX_BODY) {
    try { body = JSON.parse(text) } catch { body = null }
  }
  if (res.status >= 300 && res.status < 400) throw new VendorError(vendor, `${label}: the vendor answered with a redirect — check the base URL`, 502)
  if ((res.status < 200 || res.status >= 300) && !opts.allowStatus?.includes(res.status)) {
    const why = vendorErrorText(body, res.statusText || `HTTP ${res.status}`)
    throw new VendorError(vendor, `${label}: ${why}`, res.status >= 500 || res.status === 429 ? 502 : 400)
  }
  return { status: res.status, body }
}

/** Dotted path lookup ("data.result.status", "items.0.id"). Pure. */
export function pick(obj: unknown, path: string | null | undefined): unknown {
  if (!path) return undefined
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) cur = /^\d+$/.test(part) ? cur[Number(part)] : undefined
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[part]
    else return undefined
  }
  return cur
}

/** Upper-case letters only, as tokens. Pure. */
export function nameTokens(s: unknown): string[] {
  return String(s || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean)
}

/**
 * Lenient name match (Indian names: initials, order, middle names). Every
 * token of the shorter name must match a token of the longer one, where a
 * single letter matches a token starting with it. Pure.
 */
export function namesMatch(a: unknown, b: unknown): boolean {
  const x = nameTokens(a), y = nameTokens(b)
  if (!x.length || !y.length) return true // nothing to compare → no finding
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  const pool = [...long]
  let full = 0
  for (const t of short) {
    const i = pool.findIndex((p) => p === t || (t.length === 1 && p.startsWith(t)) || (p.length === 1 && t.startsWith(p)))
    if (i < 0) return false
    if (pool[i].length > 1 && t.length > 1) full++
    pool.splice(i, 1)
  }
  return full >= 1
}
