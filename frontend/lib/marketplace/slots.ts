/**
 * Service booking slots — pure. A service publishes weekly rules in the SELLER's time zone
 * (e.g. Mon 09:00–17:00 Asia/Kolkata); slots are generated as UTC instants so a buyer in any
 * time zone sees the same moments, just formatted locally. DST-safe via Intl offsets.
 */

export interface WeeklyRule { dow: number; start: string; end: string }
export interface ServiceSpec { duration_min: number; weekly: WeeklyRule[]; timezone: string; buffer_min?: number; /** Max held/booked sessions per seller-local day (all of the seller's services); 0/absent = no cap. */ max_per_day?: number }

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseHm(s: string): number | null {
  const m = HM.exec(s)
  return m ? Number(m[1]) * 60 + Number(m[2]) : s === '24:00' ? 1440 : null
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function partsIn(tz: string, t: number) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    fmtCache.set(tz, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(t))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute, s: o.second }
}

/** Offset of `tz` from UTC at instant `t`, in ms (IST → +19 800 000). */
export function tzOffsetMs(tz: string, t: number): number {
  const p = partsIn(tz, t)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
}

/** The UTC instant of a wall-clock time in `tz`. */
export function zonedWallToUtc(y: number, m: number, d: number, minutes: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  const first = guess - tzOffsetMs(tz, guess)
  const second = guess - tzOffsetMs(tz, first)
  return second
}

export interface SlotQuery {
  fromMs: number
  toMs: number
  nowMs: number
  /** earliest bookable = now + lead (default 2 h) */
  minLeadMin?: number
  /** already held/booked intervals (UTC ISO) */
  taken?: { start: string; end: string }[]
  max?: number
}

/** Bookable slot starts (UTC ISO strings, ascending). */
export function generateSlots(spec: ServiceSpec, q: SlotQuery): string[] {
  const duration = Math.round(spec.duration_min)
  if (!Number.isFinite(duration) || duration < 5 || duration > 24 * 60) return []
  if (!isValidTimeZone(spec.timezone)) return []
  const buffer = Math.max(0, Math.round(spec.buffer_min ?? 0))
  const step = duration + buffer
  const earliest = Math.max(q.fromMs, q.nowMs + (q.minLeadMin ?? 120) * 60_000)
  const taken = (q.taken || []).map((b) => [Date.parse(b.start) - buffer * 60_000, Date.parse(b.end) + buffer * 60_000] as const)
  const max = q.max ?? 500
  const out = new Set<number>()
  // Daily cap: count the seller's taken sessions per seller-local date.
  const cap = Math.max(0, Math.floor(spec.max_per_day ?? 0))
  const perDay = new Map<string, number>()
  if (cap > 0) {
    for (const b of q.taken || []) {
      const t = Date.parse(b.start)
      if (!Number.isFinite(t)) continue
      const p = partsIn(spec.timezone, t)
      const k = `${p.y}-${p.m}-${p.d}`
      perDay.set(k, (perDay.get(k) || 0) + 1)
    }
  }

  // Walk seller-local calendar days covering [from, to] (one day of slack each side).
  const startLocal = partsIn(spec.timezone, q.fromMs - 86_400_000)
  const days = Math.min(120, Math.ceil((q.toMs - q.fromMs) / 86_400_000) + 3)
  for (let i = 0; i < days && out.size < max; i++) {
    const day = new Date(Date.UTC(startLocal.y, startLocal.m - 1, startLocal.d + i))
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate(), dow = day.getUTCDay()
    if (cap > 0 && (perDay.get(`${y}-${m}-${d}`) || 0) >= cap) continue
    for (const rule of spec.weekly || []) {
      if (rule.dow !== dow) continue
      const a = parseHm(rule.start), b = parseHm(rule.end)
      if (a == null || b == null || b <= a) continue
      for (let s = a; s + duration <= b; s += step) {
        const startMs = zonedWallToUtc(y, m, d, s, spec.timezone)
        const endMs = startMs + duration * 60_000
        if (startMs < earliest || startMs >= q.toMs) continue
        if (taken.some(([ts, te]) => startMs < te && endMs > ts)) continue
        out.add(startMs)
      }
    }
  }
  return [...out].sort((x, y) => x - y).slice(0, max).map((t) => new Date(t).toISOString())
}

/** Is `startIso` one of the slots the rules allow right now (server-side check before holding)? */
export function isBookableSlot(spec: ServiceSpec, startIso: string, q: Omit<SlotQuery, 'fromMs' | 'toMs'>): boolean {
  const t = Date.parse(startIso)
  if (!Number.isFinite(t)) return false
  const slots = generateSlots(spec, { ...q, fromMs: t - 60_000, toMs: t + 60_000, max: 10 })
  return slots.includes(new Date(t).toISOString())
}
