/**
 * Batch readiness (pure, unit tested). The server loads each student's recent
 * company-test practice, adaptive tests, contest results and (when present)
 * skill-passport level; these functions turn them into per-department /
 * per-batch aggregates, weak areas and top performers.
 *
 * Student readiness (0–100) = weighted mean of the components the student
 * has data for (weights renormalised), so a student who only practises
 * company tests is not dragged down by missing contests:
 *   company tests 45% · adaptive tests 30% · contests 15% · passport 10%
 * A student with no data at all has readiness `null` and is counted as inactive.
 */

export interface CompanyTestSignal { percent: number; passed: boolean; sections: { name: string; percent: number }[] }
export interface UserSignals {
  companyTests: CompanyTestSignal[]
  /** Adaptive test results, percent of max. */
  adaptive: number[]
  /** Contest / codeathon results as percentile (1 = top, 0 = last); null = took part, unranked. */
  contests: Array<number | null>
  /** Skill passport level 1–4 (beginner … expert, lib/passport) when the student shares their passport. */
  passportLevel?: number | null
}

export interface ReadinessStudent { id: string; name: string; department_id: string | null; batch_id: string | null; user_id: string | null }

export const READINESS_WEIGHTS = { company: 0.45, adaptive: 0.3, contests: 0.15, passport: 0.1 } as const
export const PASSPORT_MAX_LEVEL = 4
/** A weak area needs at least this many section results across the group. */
export const WEAK_AREA_MIN_SAMPLES = 3
export const TOP_PERFORMERS = 5

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)

export interface StudentReadiness {
  student_id: string
  name: string
  department_id: string | null
  batch_id: string | null
  readiness: number | null
  company_avg: number | null
  company_pass_rate: number | null
  adaptive_avg: number | null
  contest_count: number
  contest_best_percentile: number | null
  passport_level: number | null
}

export function studentReadiness(s: ReadinessStudent, sig: UserSignals | undefined): StudentReadiness {
  const company = sig?.companyTests ?? []
  const companyAvg = mean(company.map((c) => clampPct(c.percent)))
  const passRate = company.length ? (company.filter((c) => c.passed).length / company.length) * 100 : null
  const adaptiveAvg = mean((sig?.adaptive ?? []).map(clampPct))
  const ranked = (sig?.contests ?? []).filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
  const best = ranked.length ? Math.max(...ranked.map((p) => Math.min(1, Math.max(0, p)))) : null
  const level = typeof sig?.passportLevel === 'number' && Number.isFinite(sig.passportLevel) ? Math.min(PASSPORT_MAX_LEVEL, Math.max(0, sig.passportLevel)) : null

  const parts: Array<[number, number]> = []
  if (companyAvg !== null) parts.push([companyAvg, READINESS_WEIGHTS.company])
  if (adaptiveAvg !== null) parts.push([adaptiveAvg, READINESS_WEIGHTS.adaptive])
  if (best !== null) parts.push([best * 100, READINESS_WEIGHTS.contests])
  if (level !== null) parts.push([(level / PASSPORT_MAX_LEVEL) * 100, READINESS_WEIGHTS.passport])
  const w = parts.reduce((t, [, x]) => t + x, 0)
  const readiness = w > 0 ? parts.reduce((t, [v, x]) => t + v * x, 0) / w : null

  return {
    student_id: s.id,
    name: s.name,
    department_id: s.department_id,
    batch_id: s.batch_id,
    readiness: r1(readiness),
    company_avg: r1(companyAvg),
    company_pass_rate: r1(passRate),
    adaptive_avg: r1(adaptiveAvg),
    contest_count: (sig?.contests ?? []).length,
    contest_best_percentile: best === null ? null : Math.round(best * 100),
    passport_level: level,
  }
}

function clampPct(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

export interface GroupReadiness {
  department_id: string | null
  batch_id: string | null
  students: number
  active: number
  readiness_avg: number | null
  company_avg: number | null
  company_pass_rate: number | null
  adaptive_avg: number | null
  contest_entries: number
  passport_avg: number | null
  weak_areas: { area: string; avg: number; samples: number }[]
  top: { student_id: string; name: string; readiness: number }[]
}

function aggregate(key: { department_id: string | null; batch_id: string | null }, rows: StudentReadiness[], sigs: Array<UserSignals | undefined>): GroupReadiness {
  const vals = (f: (r: StudentReadiness) => number | null) => rows.map(f).filter((x): x is number => x !== null)
  const sections = new Map<string, number[]>()
  for (const sig of sigs) {
    for (const t of sig?.companyTests ?? []) {
      for (const sec of t.sections) {
        const name = sec.name.trim()
        if (!name) continue
        const list = sections.get(name) ?? []
        list.push(clampPct(sec.percent))
        sections.set(name, list)
      }
    }
  }
  const weak = [...sections.entries()]
    .filter(([, xs]) => xs.length >= WEAK_AREA_MIN_SAMPLES)
    .map(([area, xs]) => ({ area, avg: r1(mean(xs))!, samples: xs.length }))
    .sort((a, b) => a.avg - b.avg || a.area.localeCompare(b.area))
    .slice(0, 3)
  const top = rows
    .filter((r): r is StudentReadiness & { readiness: number } => r.readiness !== null)
    .sort((a, b) => b.readiness - a.readiness || a.name.localeCompare(b.name))
    .slice(0, TOP_PERFORMERS)
    .map((r) => ({ student_id: r.student_id, name: r.name, readiness: r.readiness }))
  return {
    ...key,
    students: rows.length,
    active: rows.filter((r) => r.readiness !== null).length,
    readiness_avg: r1(mean(vals((r) => r.readiness))),
    company_avg: r1(mean(vals((r) => r.company_avg))),
    company_pass_rate: r1(mean(vals((r) => r.company_pass_rate))),
    adaptive_avg: r1(mean(vals((r) => r.adaptive_avg))),
    contest_entries: rows.reduce((t, r) => t + r.contest_count, 0),
    passport_avg: r1(mean(vals((r) => r.passport_level))),
    weak_areas: weak,
    top,
  }
}

/** Per (department, batch) groups, plus the whole selection as `overall`. */
export function computeReadiness(students: readonly ReadinessStudent[], signals: ReadonlyMap<string, UserSignals>): {
  overall: GroupReadiness
  groups: GroupReadiness[]
  students: StudentReadiness[]
} {
  const per = students.map((s) => ({ s, sig: s.user_id ? signals.get(s.user_id) : undefined }))
  const rows = per.map(({ s, sig }) => studentReadiness(s, sig))
  const buckets = new Map<string, number[]>()
  per.forEach(({ s }, i) => {
    const k = `${s.department_id ?? ''}|${s.batch_id ?? ''}`
    const list = buckets.get(k) ?? []
    list.push(i)
    buckets.set(k, list)
  })
  const groups = [...buckets.entries()].map(([k, idx]) => {
    const [d, b] = k.split('|')
    return aggregate({ department_id: d || null, batch_id: b || null }, idx.map((i) => rows[i]), idx.map((i) => per[i].sig))
  }).sort((a, b) => (a.department_id ?? '').localeCompare(b.department_id ?? '') || (a.batch_id ?? '').localeCompare(b.batch_id ?? ''))
  return {
    overall: aggregate({ department_id: null, batch_id: null }, rows, per.map((p) => p.sig)),
    groups,
    students: rows,
  }
}

/** Contest percentile from a rank: 1st of N → 1, last of N → 0 (single entrant → 1). */
export function percentileFromRank(rank: number | null | undefined, ranked: number): number | null {
  if (!rank || !Number.isFinite(rank) || rank < 1 || ranked < 1) return null
  if (ranked === 1) return 1
  return Math.max(0, Math.min(1, 1 - (rank - 1) / (ranked - 1)))
}
