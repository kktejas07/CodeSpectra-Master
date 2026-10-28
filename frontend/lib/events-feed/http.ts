/**
 * Polite HTTP for connectors: identifying User-Agent, robots.txt honoured
 * (cached per origin for 24 h), per-host spacing, timeouts, size cap, and SSRF
 * protection (lib/url-safety safeFetch) because admins can add feed URLs.
 */
import { readTextCapped, safeFetch } from '@/lib/url-safety'

export const USER_AGENT = 'CodeSpectraEventsBot/1.0 (+https://codespectra.ai/events; events listing; contact: support@codespectra.ai)'
const UA_TOKEN = 'codespectraeventsbot'
const MAX_BYTES = 5 * 1024 * 1024

export interface HttpResult { status: number; text: string; contentType: string }
export interface HttpOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  /** Minimum gap between requests to this host (default 2 s). */
  minGapMs?: number
  /** Skip robots.txt (only for official APIs whose docs invite automated use). */
  officialApi?: boolean
}
export type HttpGet = (url: string, opts?: HttpOptions) => Promise<HttpResult>

// ─── robots.txt (pure) ──────────────────────────────────────────────────────

/**
 * Is `path` allowed for our bot? Uses the group for our UA token if present,
 * else `*`. Longest matching rule wins; Allow wins ties. Supports `*` and `$`.
 */
export function robotsAllows(robotsTxt: string, path: string, uaToken = UA_TOKEN): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = []
  let cur: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (field === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur) }
      cur.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((field === 'allow' || field === 'disallow') && cur) {
      lastWasAgent = false
      if (field === 'disallow' && !value) continue
      cur.rules.push({ allow: field === 'allow', pattern: value })
    } else {
      lastWasAgent = false
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && uaToken.includes(a)))
  const group = mine.length ? mine : groups.filter((g) => g.agents.includes('*'))
  const rules = group.flatMap((g) => g.rules)
  let best: { allow: boolean; len: number } | null = null
  for (const r of rules) {
    const re = new RegExp('^' + r.pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')) // a trailing `$` stays an end anchor
    if (re.test(path)) {
      const len = r.pattern.length
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len }
    }
  }
  return best ? best.allow : true
}

// ─── Live client ────────────────────────────────────────────────────────────

const robotsCache = new Map<string, { at: number; txt: string | null }>()
const lastHit = new Map<string, number>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Streams the body and stops at MAX_BYTES (an endless chunked body can't exhaust memory). */
const readCapped = (res: Response): Promise<string> => readTextCapped(res, MAX_BYTES)

async function robotsFor(origin: string): Promise<string | null> {
  const hit = robotsCache.get(origin)
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.txt
  let txt: string | null = null
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) })
    // 4xx = no rules; 5xx = treat as "disallow everything" for now (RFC 9309 §2.3.1.4).
    if (res.ok) txt = await readCapped(res)
    else if (res.status >= 500) txt = 'User-agent: *\nDisallow: /'
  } catch {
    txt = 'User-agent: *\nDisallow: /'
  }
  robotsCache.set(origin, { at: Date.now(), txt })
  return txt
}

export const politeGet: HttpGet = async (url, opts = {}) => {
  const u = new URL(url)
  if (!opts.officialApi) {
    const robots = await robotsFor(u.origin)
    if (robots && !robotsAllows(robots, u.pathname + u.search)) throw new Error(`robots.txt disallows ${u.pathname}`)
  }
  const gap = opts.minGapMs ?? 2000
  const wait = (lastHit.get(u.host) || 0) + gap - Date.now()
  if (wait > 0) await sleep(Math.min(wait, 10_000))
  lastHit.set(u.host, Date.now())
  const res = await safeFetch(url, {
    method: opts.method || 'GET',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, application/xml, text/xml, text/calendar, text/html;q=0.8, */*;q=0.5', ...(opts.headers || {}) },
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  })
  if (res.status === 429) throw new Error('Rate limited by source (429)')
  const text = await readCapped(res)
  return { status: res.status, text, contentType: res.headers.get('content-type') || '' }
}

export function jsonOf(r: HttpResult): unknown {
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`)
  try { return JSON.parse(r.text) } catch { throw new Error('Source returned invalid JSON') }
}

export function __resetHttpState() { robotsCache.clear(); lastHit.clear() }
