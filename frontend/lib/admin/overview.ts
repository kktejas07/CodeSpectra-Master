/**
 * Admin home overview — pure helpers (tested in tests/admin-overview.test.ts).
 * The route (app/api/admin/overview) groups rows by UTC day in Mongo; these
 * turn that sparse result into a dense, oldest-first series for sparklines.
 */

/** The last `n` UTC days as YYYY-MM-DD, oldest first, ending today. */
export function utcDayKeys(now: Date, n: number): string[] {
  const out: string[] = []
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  return out
}

/** Dense series over `keys` from sparse `{ _id: day, n }` rows (missing days → 0). */
export function denseSeries(rows: Array<{ _id: string | null; n: number }>, keys: string[]): number[] {
  const m = new Map<string, number>()
  for (const r of rows) if (r._id) m.set(r._id, (m.get(r._id) ?? 0) + (Number(r.n) || 0))
  return keys.map((k) => m.get(k) ?? 0)
}

export interface AdminOverview {
  /** Proctored / tracked test attempts (integrity_attempts) started per day, last 14 days. */
  tests: { today: number; by_day: number[] }
  /** Attempts with integrity events that nobody has reviewed yet, last 30 days. */
  flags: { open: number }
  /** Model calls logged in ai_usage, last 30 days (calls and tokens; cost isn't recorded per call). */
  ai: { requests: number; tokens: number; failed: number; by_day: number[] }
  /** Sign-ups per day, last 14 days. */
  signups: { by_day: number[] }
}
