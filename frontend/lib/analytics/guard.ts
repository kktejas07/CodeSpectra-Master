/**
 * W4-06: abuse limits for the public analytics ingest (POST /api/analytics/collect).
 *
 *  - Origin check: browser beacons carry Origin (or Referer) of our own site;
 *    anything else is accepted with 202 and dropped.
 *  - Path rules: ≤ MAX_PATH_LEN chars from the URL path charset only.
 *  - Custom events: names must be on the allowlist (DEFAULT_CLIENT_EVENTS plus
 *    Admin → Settings → Analytics "Extra custom events").
 *  - Daily caps per visitor (consented id or daily hash) and per IP (hashed
 *    with the daily salt — no raw IP stored), counted atomically in
 *    `analytics_caps` (TTL 2 days).
 *
 * The pure helpers are unit tested; capsAllow() does the I/O.
 */
import { SERVER_EVENT_NAMES } from './events'

export const MAX_PATH_LEN = 200
const PATH_RE = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/[\]]*$/

/** Client custom events accepted without admin configuration. */
export const DEFAULT_CLIENT_EVENTS: readonly string[] = [
  'practice_run', 'cta_click', 'signup_start', 'search', 'share', 'outbound_click',
  'download', 'video_play', 'video_complete', 'form_start', 'form_submit', 'cookie_settings_open',
  'job_view', 'product_view', 'course_view', 'pricing_view',
]

export const EVENT_NAME_RE = /^[a-z][a-z0-9_.:-]{0,63}$/

export const DEFAULT_VISITOR_DAILY_CAP = 2_000
export const DEFAULT_IP_DAILY_CAP = 10_000

export function validPath(p: string): boolean {
  return p.length > 0 && p.length <= MAX_PATH_LEN && PATH_RE.test(p)
}

/** Parse the admin list ("a, b c") → valid, non-reserved names. */
export function parseCustomEventList(raw: unknown): string[] {
  return String(raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EVENT_NAME_RE.test(s) && !SERVER_EVENT_NAMES.has(s))
    .slice(0, 200)
}

export function eventAllowlist(extra: unknown): ReadonlySet<string> {
  return new Set([...DEFAULT_CLIENT_EVENTS, ...parseCustomEventList(extra)])
}

/** Admin save validation for the extra-events field (null = OK). */
export function validateCustomEventList(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string' || raw.length > 4000) return 'Custom events: a comma-separated list, up to 4000 characters.'
  const bad = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).find((s) => !EVENT_NAME_RE.test(s.toLowerCase()) || SERVER_EVENT_NAMES.has(s.toLowerCase()))
  return bad ? `"${bad.slice(0, 40)}" isn't allowed as a custom event name (lower_snake_case, not a built-in business event).` : null
}

/**
 * Origin / Referer of the request must be our own host (or the configured app
 * URL host). Missing both → not a browser beacon from our pages.
 */
export function sameSiteOrigin(headers: { get(n: string): string | null }, ownHosts: string[]): boolean {
  const hosts = new Set(ownHosts.filter(Boolean).map((h) => h.toLowerCase()))
  for (const name of ['origin', 'referer']) {
    const v = headers.get(name)
    if (!v || v === 'null') continue
    try {
      return hosts.has(new URL(v).host.toLowerCase())
    } catch {
      return false
    }
  }
  return false
}

function envInt(v: string | undefined, d: number): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : d
}

export function dailyCaps(env: Record<string, string | undefined> = process.env): { visitor: number; ip: number } {
  return {
    visitor: envInt(env.ANALYTICS_MAX_EVENTS_PER_VISITOR_DAY, DEFAULT_VISITOR_DAILY_CAP),
    ip: envInt(env.ANALYTICS_MAX_EVENTS_PER_IP_DAY, DEFAULT_IP_DAILY_CAP),
  }
}

type CapsCol = {
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, opts: Record<string, unknown>): Promise<unknown>
}

/**
 * Atomically add `n` to each counter and say whether every one stayed within
 * its cap. Keys must already be hashed (never a raw IP).
 */
export async function capsAllow(
  col: CapsCol,
  day: string,
  counters: Array<{ key: string; cap: number }>,
  n: number,
): Promise<boolean> {
  if (n <= 0) return true
  const expires = new Date(Date.parse(`${day}T00:00:00.000Z`) + 2 * 86_400_000)
  let ok = true
  for (const c of counters) {
    if (!c.key) continue
    const res = (await col.findOneAndUpdate(
      { _id: `${day}:${c.key}` },
      { $inc: { n }, $setOnInsert: { expires_at: expires } },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false },
    )) as { n?: number; value?: { n?: number } } | null
    const total = Number(res?.n ?? res?.value?.n ?? 0)
    if (total > c.cap) ok = false
  }
  return ok
}
