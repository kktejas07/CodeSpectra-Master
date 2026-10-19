/**
 * Date ranges for analytics (pure). A range is [from, to) in UTC whole days.
 *   parseRange({ from: '2026-01-01', to: '2026-01-31' })  → 31 days, inclusive of the 31st
 *   parseRange({ preset: '30d' })                          → the last 30 days including today
 */
export interface DateRange { from: Date; to: Date; days: number }

export const MAX_RANGE_DAYS = 400
const DAY = 86_400_000
const PRESETS: Record<string, number> = { '1d': 1, '7d': 7, '14d': 14, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const okDay = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`))

export function parseRange(q: { from?: string | null; to?: string | null; preset?: string | null }, now: Date = new Date()): DateRange {
  const today = startOfDay(now)
  let to = new Date(today.getTime() + DAY)
  let from: Date
  if (okDay(q.from)) {
    from = new Date(`${q.from}T00:00:00.000Z`)
    if (okDay(q.to)) to = new Date(Date.parse(`${q.to}T00:00:00.000Z`) + DAY)
  } else {
    const n = PRESETS[String(q.preset || '30d')] ?? 30
    from = new Date(to.getTime() - n * DAY)
  }
  if (to.getTime() > today.getTime() + DAY) to = new Date(today.getTime() + DAY)
  if (from >= to) from = new Date(to.getTime() - DAY)
  if ((to.getTime() - from.getTime()) / DAY > MAX_RANGE_DAYS) from = new Date(to.getTime() - MAX_RANGE_DAYS * DAY)
  return { from, to, days: Math.round((to.getTime() - from.getTime()) / DAY) }
}

/** The same-length period right before `r`. */
export function previousRange(r: DateRange): DateRange {
  return { from: new Date(r.from.getTime() - r.days * DAY), to: new Date(r.from), days: r.days }
}

export function dayKeys(r: DateRange): string[] {
  const out: string[] = []
  for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** Mongo filter matching a date field stored either as Date or as ISO string. */
export function inRange(field: string, r: DateRange): Record<string, unknown> {
  return { $or: [{ [field]: { $gte: r.from, $lt: r.to } }, { [field]: { $gte: r.from.toISOString(), $lt: r.to.toISOString() } }] }
}

/** % change from `prev` to `cur` (null when there's no base). */
export function delta(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}
