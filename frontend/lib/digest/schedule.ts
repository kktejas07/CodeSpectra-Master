/**
 * When the daily digest runs (pure; the scheduler's content lane asks every
 * minute, the date is claimed in the database so replicas run it once).
 *
 *  - Bootstrap: no digest has ever been published → run now (the owner's
 *    "right now publish the top 25"), for today's local date.
 *  - Then once per local day (settings.timezone, default Asia/Kolkata) from
 *    settings.publish_time (default 08:00). A day missed while the app was
 *    down is caught up on the first tick after the publish time.
 *  - One digest per date: a date that already has one is never run again by
 *    the schedule (admins can still "Run now", which replaces the draft /
 *    review copy but never duplicates the date).
 */
import type { DigestSettings } from './settings'

/** Local calendar day (YYYY-MM-DD) of `now` in `tz`. */
export function localDay(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** Minutes since local midnight in `tz`. */
export function localMinutes(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0)
    return (get('hour') % 24) * 60 + get('minute')
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

const hhmm = (s: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 8 * 60
}

export interface DueInput {
  /** How many digests exist (any status). */
  total: number
  /** Does today's local date already have a digest? */
  hasToday: boolean
}

export type DueDecision = { date: string; trigger: 'bootstrap' | 'schedule' } | null

/** Should a digest run now, and for which date? Pure. */
export function digestDue(now: Date, s: Pick<DigestSettings, 'enabled' | 'timezone' | 'publish_time' | 'bootstrap'>, st: DueInput): DueDecision {
  if (!s.enabled) return null
  const date = localDay(now, s.timezone)
  if (st.hasToday) return null
  if (st.total === 0 && s.bootstrap) return { date, trigger: 'bootstrap' }
  if (localMinutes(now, s.timezone) >= hhmm(s.publish_time)) return { date, trigger: 'schedule' }
  return null
}

/** Next scheduled run (approximate, for the admin page): today's or tomorrow's publish time. Pure. */
export function nextRunLabel(now: Date, s: Pick<DigestSettings, 'timezone' | 'publish_time'>, hasToday: boolean): { date: string; time: string; timezone: string } {
  const today = localDay(now, s.timezone)
  const due = localMinutes(now, s.timezone) >= hhmm(s.publish_time)
  const date = hasToday || due ? localDay(new Date(now.getTime() + 86_400_000), s.timezone) : today
  return { date, time: s.publish_time, timezone: s.timezone }
}

export const digestId = (date: string) => `dg_${date}`
export const isDigestDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
