/**
 * Minimal IANA time-zone helpers on top of Intl (no extra dependency).
 * Pure; used by slot computation and email formatting.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    })
    dtfCache.set(tz, f)
  }
  return f
}

/** True when the runtime knows this IANA zone. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

/** Wall-clock parts of an instant in `tz`. */
export function zonedParts(date: Date, tz: string): ZonedParts {
  const out: Record<string, string> = {}
  for (const p of dtf(tz).formatToParts(date)) out[p.type] = p.value
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday] ?? 0,
  }
}

/** Offset of `tz` from UTC at `date`, in ms (IST → +19 800 000). */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * The UTC instant for a wall-clock time in `tz`. Month is 1-based. For a time
 * skipped by a DST jump the result lands just after the gap.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let t = guess - tzOffsetMs(new Date(guess), tz)
  // Re-check once: the offset at the result may differ (DST boundary).
  const off2 = tzOffsetMs(new Date(t), tz)
  t = guess - off2
  return new Date(t)
}

/** "Mon 20 Oct 2026, 10:30 (Asia/Kolkata)" — for emails and messages. */
export function formatInZone(iso: string | Date, tz: string): string {
  const d = new Date(iso)
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(d)
    return `${s} (${tz})`
  } catch {
    return d.toISOString()
  }
}
