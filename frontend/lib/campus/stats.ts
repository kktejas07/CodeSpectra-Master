/**
 * Placement statistics per graduation year (pure, unit tested). Only the
 * placement office sees these; students only ever see their own offers.
 *
 * A student counts as placed when they hold at least one offer that is
 * `offered` or `accepted` (declined / revoked offers don't count). CTC
 * figures use each placed student's best live offer, so a student with three
 * offers doesn't triple-count in the median.
 */
import type { OfferStatus } from './types'

export interface StatsStudent { id: string; department_id: string | null; graduation_year: number | null }
export interface StatsOffer { student_id: string; ctc_minor: number; status: OfferStatus; currency: string }

export interface YearStats {
  year: number
  students: number
  placed: number
  placed_pct: number
  offers: number
  /** Median / max of placed students' best offer, minor units (null when nobody is placed). */
  median_ctc_minor: number | null
  max_ctc_minor: number | null
  currency: string | null
  by_department: { department_id: string | null; students: number; placed: number; placed_pct: number }[]
}

const LIVE = new Set<OfferStatus>(['offered', 'accepted'])

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)

export function placementStats(students: readonly StatsStudent[], offers: readonly StatsOffer[]): YearStats[] {
  const byStudent = new Map<string, StatsOffer[]>()
  for (const o of offers) {
    const list = byStudent.get(o.student_id) ?? []
    list.push(o)
    byStudent.set(o.student_id, list)
  }
  const years = new Map<number, StatsStudent[]>()
  for (const s of students) {
    if (s.graduation_year === null) continue
    const list = years.get(s.graduation_year) ?? []
    list.push(s)
    years.set(s.graduation_year, list)
  }
  return [...years.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => {
    const best: number[] = []
    const currencies = new Set<string>()
    let offerCount = 0
    const placedIds = new Set<string>()
    for (const s of list) {
      const all = byStudent.get(s.id) ?? []
      offerCount += all.length
      const live = all.filter((o) => LIVE.has(o.status) && Number.isFinite(o.ctc_minor))
      if (!live.length) continue
      placedIds.add(s.id)
      const top = live.reduce((a, b) => (b.ctc_minor > a.ctc_minor ? b : a))
      best.push(top.ctc_minor)
      currencies.add(top.currency)
    }
    const depts = new Map<string, { students: number; placed: number }>()
    for (const s of list) {
      const k = s.department_id ?? ''
      const d = depts.get(k) ?? { students: 0, placed: 0 }
      d.students++
      if (placedIds.has(s.id)) d.placed++
      depts.set(k, d)
    }
    return {
      year,
      students: list.length,
      placed: placedIds.size,
      placed_pct: pct(placedIds.size, list.length),
      offers: offerCount,
      median_ctc_minor: median(best),
      max_ctc_minor: best.length ? Math.max(...best) : null,
      // Mixed currencies can't be compared; the UI says so instead of a misleading median.
      currency: currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? null : 'MIXED',
      by_department: [...depts.entries()].map(([k, d]) => ({ department_id: k || null, ...d, placed_pct: pct(d.placed, d.students) }))
        .sort((a, b) => (a.department_id ?? '').localeCompare(b.department_id ?? '')),
    }
  })
}
