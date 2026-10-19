/**
 * Funnel + cohort math (pure, unit tested).
 */

export interface FunnelStepInput { key: string; label: string; count: number }
export interface FunnelStep extends FunnelStepInput {
  /** count / previous step count, % (null on the first step or when the previous is 0). */
  step_conversion: number | null
  /** count / first step count, %. */
  overall_conversion: number | null
  dropoff: number
}
export interface FunnelResult { name: string; label: string; steps: FunnelStep[]; overall: number | null; note?: string }

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)

export function computeFunnel(name: string, label: string, input: FunnelStepInput[], note?: string): FunnelResult {
  const first = input[0]?.count ?? 0
  const steps = input.map((s, i) => {
    const prev = i === 0 ? null : input[i - 1].count
    return {
      ...s,
      step_conversion: prev === null ? null : pct(s.count, prev),
      overall_conversion: i === 0 ? (first > 0 ? 100 : null) : pct(s.count, first),
      dropoff: prev === null ? 0 : Math.max(0, prev - s.count),
    }
  })
  const last = input[input.length - 1]?.count ?? 0
  return { name, label, steps, overall: input.length > 1 ? pct(last, first) : null, ...(note ? { note } : {}) }
}

/**
 * Ordered funnel over actors: an actor counts at step i only if it reached
 * every earlier step at or before the time it reached step i.
 * `hits[i]` = Map(actor → first time (ms) the actor did step i).
 */
export function orderedFunnelCounts(hits: Map<string, number>[]): number[] {
  if (!hits.length) return []
  const counts: number[] = []
  let alive = new Map(hits[0])
  counts.push(alive.size)
  for (let i = 1; i < hits.length; i++) {
    const next = new Map<string, number>()
    for (const [actor, t] of alive) {
      const ti = hits[i].get(actor)
      if (ti !== undefined && ti >= t) next.set(actor, ti)
    }
    alive = next
    counts.push(alive.size)
  }
  return counts
}

export const FUNNELS = {
  acquisition: 'Visit → sign-up → activation → paid',
  candidate: 'Candidate invited → started → submitted',
  hiring: 'Job view → applied → hired',
  marketplace: 'Product view → cart → checkout → paid',
} as const
export type FunnelName = keyof typeof FUNNELS
export const isFunnelName = (s: string): s is FunnelName => s in FUNNELS

// ─── Weekly retention cohorts ───────────────────────────────────────────────

const WEEK = 7 * 86_400_000

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStart(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - dow * 86_400_000)
}

export interface CohortRow { cohort: string; size: number; weeks: (number | null)[] }

/**
 * users: id + sign-up time; activeDays: user → set of 'YYYY-MM-DD'.
 * weeks[k] = % of the cohort active in week k after the sign-up week (k=0 is the sign-up week),
 * null for weeks that haven't happened yet.
 */
export function cohortRetention(users: { id: string; signup: Date }[], activeDays: Map<string, Set<string>>, opts: { weeks: number; now: Date }): CohortRow[] {
  const nowWeek = weekStart(opts.now).getTime()
  const cohorts = new Map<number, string[]>()
  for (const u of users) {
    const w = weekStart(u.signup).getTime()
    if (nowWeek - w >= opts.weeks * WEEK || w > nowWeek) continue
    const list = cohorts.get(w) ?? []
    list.push(u.id)
    cohorts.set(w, list)
  }
  const out: CohortRow[] = []
  for (const [w, ids] of [...cohorts.entries()].sort((a, b) => a[0] - b[0])) {
    const elapsed = Math.floor((nowWeek - w) / WEEK)
    const weeks: (number | null)[] = []
    for (let k = 0; k < opts.weeks; k++) {
      if (k > elapsed) { weeks.push(null); continue }
      const from = w + k * WEEK
      let active = 0
      for (const id of ids) {
        const days = activeDays.get(id)
        if (!days) continue
        for (let d = 0; d < 7; d++) {
          if (days.has(new Date(from + d * 86_400_000).toISOString().slice(0, 10))) { active++; break }
        }
      }
      weeks.push(Math.round((active / ids.length) * 1000) / 10)
    }
    out.push({ cohort: new Date(w).toISOString().slice(0, 10), size: ids.length, weeks })
  }
  return out
}
