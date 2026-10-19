/**
 * Self-schedule slot computation (pure; tests/ats-interviews.test.ts).
 *
 * Rules (kept simple on purpose):
 *  - Working hours are the same for every panel member: `workStartHour`–`workEndHour`
 *    (default 9–18) in the tenant time zone, Monday–Friday only.
 *  - A slot is `durationMin` long and starts on a `stepMin` grid (default 30 min)
 *    from the start of the working day; it must end by the end of the working day.
 *  - Every panel member must be free: a slot is dropped when it overlaps (with
 *    `bufferMin` on both sides) any busy interval of any panel member — their
 *    `user_calendar_events` entries plus their other scheduled interviews.
 *  - Slots start at least `minNoticeHours` after `now` and within `days` calendar
 *    days; at most `maxSlots` are returned, earliest first.
 */
import { zonedParts, zonedTimeToUtc } from './tz'

export interface BusyInterval { start: string | Date; end: string | Date }

export interface SlotOptions {
  now: Date
  timeZone: string
  durationMin: number
  busy: BusyInterval[]
  workStartHour?: number
  workEndHour?: number
  stepMin?: number
  days?: number
  minNoticeHours?: number
  bufferMin?: number
  maxSlots?: number
  /** 0 = Sunday … 6 = Saturday; default Mon–Fri */
  workDays?: number[]
}

export interface Slot { start: string; end: string }

export const SLOT_DEFAULTS = {
  workStartHour: 9,
  workEndHour: 18,
  stepMin: 30,
  days: 10,
  minNoticeHours: 12,
  bufferMin: 0,
  maxSlots: 60,
  workDays: [1, 2, 3, 4, 5],
} as const

function toMs(v: string | Date): number {
  return v instanceof Date ? v.getTime() : Date.parse(v)
}

/** Merge busy intervals (sorted, overlapping joined); invalid ones dropped. */
export function mergeBusy(busy: BusyInterval[], bufferMin = 0): Array<[number, number]> {
  const pad = bufferMin * 60_000
  const list = busy
    .map((b) => [toMs(b.start) - pad, toMs(b.end) + pad] as [number, number])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const iv of list) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([...iv])
  }
  return out
}

function overlaps(merged: Array<[number, number]>, s: number, e: number): boolean {
  // Linear scan is fine for the sizes here (a few hundred events at most).
  for (const [bs, be] of merged) {
    if (bs >= e) return false
    if (be > s) return true
  }
  return false
}

export function computeSlots(opts: SlotOptions): Slot[] {
  const o = { ...SLOT_DEFAULTS, ...opts }
  const dur = Math.max(5, Math.min(480, Math.round(o.durationMin))) * 60_000
  const step = Math.max(5, o.stepMin) * 60_000
  const earliest = o.now.getTime() + o.minNoticeHours * 3_600_000
  const merged = mergeBusy(o.busy, o.bufferMin)
  const workDays = new Set(o.workDays)
  const out: Slot[] = []

  // Walk calendar days in the tenant zone, starting with "today" there.
  const today = zonedParts(o.now, o.timeZone)
  const base = Date.UTC(today.year, today.month - 1, today.day)
  for (let d = 0; d <= o.days && out.length < o.maxSlots; d++) {
    const day = new Date(base + d * 86_400_000) // only Y/M/D (UTC fields) are used
    const y = day.getUTCFullYear()
    const m = day.getUTCMonth() + 1
    const dd = day.getUTCDate()
    const dayStart = zonedTimeToUtc(y, m, dd, o.workStartHour, 0, o.timeZone).getTime()
    const dayEnd = zonedTimeToUtc(y, m, dd, o.workEndHour, 0, o.timeZone).getTime()
    if (!workDays.has(zonedParts(new Date(dayStart), o.timeZone).weekday)) continue
    for (let s = dayStart; s + dur <= dayEnd && out.length < o.maxSlots; s += step) {
      if (s < earliest) continue
      if (overlaps(merged, s, s + dur)) continue
      out.push({ start: new Date(s).toISOString(), end: new Date(s + dur).toISOString() })
    }
  }
  return out
}

/** Is `startIso` one of the offered slots (exact start match)? */
export function isOfferedSlot(slots: Slot[], startIso: string): Slot | null {
  const t = Date.parse(startIso)
  if (!Number.isFinite(t)) return null
  return slots.find((s) => Date.parse(s.start) === t) ?? null
}
