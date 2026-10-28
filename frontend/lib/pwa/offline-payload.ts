/**
 * Daily challenge selection + the offline question payload (pure; tests/pwa-offline.test.ts).
 *
 * The offline pack is what a learner may see anyway on the problem page:
 * statement, formats, constraints, SAMPLE tests and starter code. Hidden
 * tests, editorials, solutions and authoring fields are never included
 * (allow-list, not deny-list). Answers are graded on the server when the
 * queued submission syncs.
 */

/** UTC YYYY-MM-DD — the daily challenge rolls over at 00:00 UTC. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Index of today's problem in the id-sorted published list (same rule as /api/daily-challenge). */
export function dailyIndex(day: string, count: number): number {
  return count > 0 ? simpleHash(day) % count : -1
}

export const OFFLINE_PACK_VERSION = 1
const MAX_TEXT = 20_000
const MAX_SAMPLES = 5
const MAX_STARTER = 20_000

export interface OfflinePack {
  v: typeof OFFLINE_PACK_VERSION
  key: string
  kind: 'daily'
  day: string
  downloaded_at: string
  expires_at: string
  problem: {
    slug: string
    title: string
    difficulty: string
    topics: string[]
    statement_md: string
    input_format: string | null
    output_format: string | null
    constraints: string | null
    samples: Array<{ stdin: string; expected_stdout: string }>
    starter_code: Record<string, string>
    time_limit_ms: number | null
  }
}

type ProblemLike = {
  slug?: unknown; title?: unknown; difficulty?: unknown; topics?: unknown
  statement_md?: unknown; input_format?: unknown; output_format?: unknown; constraints?: unknown
  test_cases?: unknown; starter_code?: unknown; time_limit_ms?: unknown
}

const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '')
const optStr = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, MAX_TEXT) : null)

export function buildOfflinePack(doc: ProblemLike, day: string, now: Date = new Date()): OfflinePack {
  const tests = Array.isArray(doc.test_cases) ? (doc.test_cases as Array<Record<string, unknown>>) : []
  const samples = tests
    .filter((t) => t && t.is_sample === true)
    .slice(0, MAX_SAMPLES)
    .map((t) => ({ stdin: str(t.stdin, 4000), expected_stdout: str(t.expected_stdout, 4000) }))
  const starter: Record<string, string> = {}
  if (doc.starter_code && typeof doc.starter_code === 'object') {
    for (const [lang, code] of Object.entries(doc.starter_code as Record<string, unknown>).slice(0, 12)) {
      if (/^[a-z0-9+#._-]{1,20}$/i.test(lang) && typeof code === 'string') starter[lang.toLowerCase()] = code.slice(0, MAX_STARTER)
    }
  }
  // Valid until the end of the next UTC day: long enough for a commute, short enough to stay "daily".
  const expires = new Date(`${day}T00:00:00.000Z`)
  expires.setUTCDate(expires.getUTCDate() + 2)
  const slug = str(doc.slug, 200)
  return {
    v: OFFLINE_PACK_VERSION,
    key: `daily:${day}`,
    kind: 'daily',
    day,
    downloaded_at: now.toISOString(),
    expires_at: expires.toISOString(),
    problem: {
      slug,
      title: str(doc.title, 300),
      difficulty: ['easy', 'medium', 'hard'].includes(String(doc.difficulty)) ? String(doc.difficulty) : 'medium',
      topics: Array.isArray(doc.topics) ? (doc.topics as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 10) : [],
      statement_md: str(doc.statement_md),
      input_format: optStr(doc.input_format),
      output_format: optStr(doc.output_format),
      constraints: optStr(doc.constraints),
      samples,
      starter_code: starter,
      time_limit_ms: typeof doc.time_limit_ms === 'number' ? doc.time_limit_ms : null,
    },
  }
}
