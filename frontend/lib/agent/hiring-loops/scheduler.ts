/**
 * Interview scheduler agent — selection logic (pure): which interviews need
 * the agent, and which free panel slots to offer.
 */
import type { SchedulerParams } from './types'

export interface SchedIv {
  id: string
  status: 'awaiting_schedule' | 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  created_at: string
  updated_at: string
  requested_slot?: string | null
  self_schedule?: boolean
  panel_count: number
  /** The application is still active and still in this interview's stage. */
  app_in_stage: boolean
}

export interface OfferState { offers: number; last_offer_at?: string | null; last_slots?: string[] }

export type SchedAction =
  | { action: 'book_requested'; slot: string }
  | { action: 'offer_slots'; reason: 'never_booked' | 'no_pick' | 'no_show' | 'cancelled' }

const HOUR = 3_600_000

/** What the agent should do for one interview now (null = nothing). Pure. */
export function classifyInterview(iv: SchedIv, st: OfferState | null, now: Date, p: SchedulerParams): SchedAction | null {
  if (!iv.app_in_stage || iv.panel_count === 0) return null
  const t = now.getTime()
  if (iv.status === 'awaiting_schedule' && iv.requested_slot && Date.parse(iv.requested_slot) > t + HOUR) {
    return { action: 'book_requested', slot: iv.requested_slot }
  }
  const offers = st?.offers ?? 0
  if (offers >= p.max_offers) return null
  if (st?.last_offer_at && t - Date.parse(st.last_offer_at) < p.followup_hours * HOUR) return null
  if (iv.status === 'awaiting_schedule') {
    if (t - Date.parse(iv.created_at) < p.stale_hours * HOUR) return null
    return { action: 'offer_slots', reason: offers > 0 || iv.self_schedule ? 'no_pick' : 'never_booked' }
  }
  if (iv.status === 'no_show' || iv.status === 'cancelled') {
    // Only soon after it happened; older rows are someone's deliberate decision.
    if (t - Date.parse(iv.updated_at) > 7 * 24 * HOUR) return null
    return { action: 'offer_slots', reason: iv.status }
  }
  return null
}

export interface SlotLike { start: string; end: string }

function localHour(iso: string, tz: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)))
  } catch {
    return new Date(iso).getUTCHours()
  }
}
function localDay(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/**
 * Up to `n` slots to offer: no sooner than `minLeadHours`, one per local day
 * (spread out), preferring 10:00–16:00 local, earliest first. Falls back to
 * more slots on the same day when there are too few days. Pure.
 */
export function pickSlots(slots: readonly SlotLike[], n: number, tz: string, now: Date, minLeadHours = 12): SlotLike[] {
  const ok = slots.filter((s) => Date.parse(s.start) >= now.getTime() + minLeadHours * HOUR).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const core = (s: SlotLike) => { const h = localHour(s.start, tz); return h >= 10 && h < 16 }
  const picked: SlotLike[] = []
  const days = new Set<string>()
  for (const pass of [core, (_: SlotLike) => true]) {
    for (const s of ok) {
      if (picked.length >= n) break
      const d = localDay(s.start, tz)
      if (days.has(d) || !pass(s)) continue
      days.add(d)
      picked.push(s)
    }
  }
  for (const s of ok) {
    if (picked.length >= n) break
    if (!picked.includes(s)) picked.push(s)
  }
  return picked.slice(0, n).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** Offered slots that are still free (exact start match). Pure. */
export function stillFree(offered: readonly string[], free: readonly SlotLike[]): SlotLike[] {
  const byStart = new Map(free.map((s) => [Date.parse(s.start), s]))
  return offered.map((o) => byStart.get(Date.parse(o))).filter((s): s is SlotLike => !!s)
}
