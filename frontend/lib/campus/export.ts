/** Readiness CSV export (pure; formula-safe cells via ./csv). */
import { toCsv } from './csv'
import type { GroupReadiness, StudentReadiness } from './readiness'
import type { CollegeDoc } from './types'

export function readinessCsv(students: readonly StudentReadiness[], groups: readonly GroupReadiness[], college: Pick<CollegeDoc, 'departments' | 'batches'>): string {
  const dept = (id: string | null) => college.departments.find((d) => d.id === id)?.name ?? ''
  const batch = (id: string | null) => college.batches.find((b) => b.id === id)?.name ?? ''
  const n = (v: number | null) => (v === null ? '' : v)
  const studentPart = toCsv(
    ['Student', 'Department', 'Batch', 'Readiness', 'Company tests avg %', 'Company tests pass %', 'Adaptive avg %', 'Contests', 'Best contest percentile', 'Passport level'],
    students.map((s) => [s.name, dept(s.department_id), batch(s.batch_id), n(s.readiness), n(s.company_avg), n(s.company_pass_rate), n(s.adaptive_avg), s.contest_count, n(s.contest_best_percentile), n(s.passport_level)]),
  )
  const groupPart = toCsv(
    ['Department', 'Batch', 'Students', 'Active', 'Readiness avg', 'Company tests avg %', 'Company pass %', 'Adaptive avg %', 'Contest entries', 'Weak areas'],
    groups.map((g) => [dept(g.department_id) || 'No department', batch(g.batch_id) || 'No batch', g.students, g.active, n(g.readiness_avg), n(g.company_avg), n(g.company_pass_rate), n(g.adaptive_avg), g.contest_entries, g.weak_areas.map((w) => `${w.area} (${w.avg}%)`).join('; ')]),
  )
  return `${studentPart}\r\n${groupPart}`
}
