/**
 * Placement officer assistant — pure selection and scoring (tested in
 * tests/assistants-placement.test.ts): which students to nudge, how to rank a
 * drive shortlist, and the weekly placement report summary.
 */

export interface NudgeCandidate {
  student_id: string
  name: string
  user_id: string | null
  department_id: string | null
  batch_id: string | null
  /** 0–100 or null (no practice data). */
  readiness: number | null
  /** ISO time of the last nudge to this student, if any. */
  last_nudged_at?: string | null
}

export type NudgeReason = 'inactive' | 'low_readiness'

export interface NudgePick { student_id: string; name: string; user_id: string; reason: NudgeReason; readiness: number | null }

export const NUDGE_DEFAULTS = { threshold: 40, max: 100, cooldownDays: 7 } as const

/**
 * Students to nudge: joined students (they have an account) with no practice at
 * all, then those under the readiness threshold (lowest first). Students nudged
 * within the cooldown are left out. Not-joined students are counted, not picked
 * (they have no account to notify; resend their invite instead). Pure.
 */
export function selectNudges(rows: readonly NudgeCandidate[], opts: { threshold?: number; max?: number; cooldownDays?: number; now?: Date; reasons?: readonly NudgeReason[] } = {}): { picks: NudgePick[]; not_joined: number; cooling_down: number } {
  const threshold = opts.threshold ?? NUDGE_DEFAULTS.threshold
  const max = Math.max(1, Math.min(500, opts.max ?? NUDGE_DEFAULTS.max))
  const cool = (opts.cooldownDays ?? NUDGE_DEFAULTS.cooldownDays) * 86_400_000
  const now = (opts.now ?? new Date()).getTime()
  const reasons = new Set<NudgeReason>(opts.reasons ?? ['inactive', 'low_readiness'])
  let notJoined = 0, cooling = 0
  const picks: NudgePick[] = []
  for (const r of rows) {
    if (!r.user_id) { notJoined++; continue }
    const reason: NudgeReason | null = r.readiness === null ? 'inactive' : r.readiness < threshold ? 'low_readiness' : null
    if (!reason || !reasons.has(reason)) continue
    const last = r.last_nudged_at ? Date.parse(r.last_nudged_at) : NaN
    if (Number.isFinite(last) && now - last < cool) { cooling++; continue }
    picks.push({ student_id: r.student_id, name: r.name, user_id: r.user_id, reason, readiness: r.readiness })
  }
  picks.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'inactive' ? -1 : 1) || (a.readiness ?? -1) - (b.readiness ?? -1) || a.name.localeCompare(b.name))
  return { picks: picks.slice(0, max), not_joined: notJoined, cooling_down: cooling }
}

export interface ShortlistInput {
  student_id: string
  name: string
  status: string
  cgpa: number | null
  /** Best company-test result on the drive's pattern, percent. */
  test_percent: number | null
  readiness: number | null
}

export interface ShortlistRow extends ShortlistInput { score: number; basis: 'test+readiness' | 'test' | 'readiness' | 'none' }

/** Drive shortlist: drive test 60% + readiness 40% (whichever exists), withdrawn / rejected out. Pure. */
export function rankShortlist(rows: readonly ShortlistInput[], limit = 50): ShortlistRow[] {
  return rows
    .filter((r) => r.status !== 'withdrawn' && r.status !== 'rejected')
    .map((r): ShortlistRow => {
      const t = r.test_percent, rd = r.readiness
      const basis: ShortlistRow['basis'] = t !== null && rd !== null ? 'test+readiness' : t !== null ? 'test' : rd !== null ? 'readiness' : 'none'
      const score = t !== null && rd !== null ? t * 0.6 + rd * 0.4 : t ?? rd ?? 0
      return { ...r, score: Math.round(score * 10) / 10, basis }
    })
    .sort((a, b) => b.score - a.score || (b.cgpa ?? 0) - (a.cgpa ?? 0) || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, Math.min(500, limit)))
}

export interface ReportInput {
  college: string
  students: number
  active: number
  readiness_avg: number | null
  weak_areas: { area: string; avg: number }[]
  drives_open: { title: string; apply_by: string; applicants: number }[]
  applications_week: number
  offers_week: number
  to_nudge: number
  /** CORE-048: students who have not completed a recent practice assignment, and how many assignments that is. */
  assignments_pending?: number
  assignments_open?: number
}

export interface PlacementReport {
  college: string
  headline: string
  lines: string[]
  numbers: Record<string, number | null>
}

/** Weekly placement report (English, for the copilot conversation and the run log). Pure. */
export function buildPlacementReport(i: ReportInput, now = new Date()): PlacementReport {
  const pct = i.students ? Math.round((i.active / i.students) * 100) : 0
  const soon = i.drives_open.filter((d) => {
    const t = Date.parse(d.apply_by)
    return Number.isFinite(t) && t >= now.getTime() && t - now.getTime() <= 7 * 86_400_000
  })
  const lines = [
    `${i.active} of ${i.students} students practised (${pct}%); average readiness ${i.readiness_avg ?? '—'}.`,
    `${i.applications_week} drive application(s) and ${i.offers_week} offer(s) this week.`,
    i.drives_open.length ? `${i.drives_open.length} open drive(s); ${soon.length} close within 7 days${soon.length ? `: ${soon.slice(0, 3).map((d) => `${d.title} (${d.applicants} applied)`).join(', ')}` : ''}.` : 'No open drives.',
    i.weak_areas.length ? `Weakest areas: ${i.weak_areas.slice(0, 3).map((w) => `${w.area} ${w.avg}%`).join(', ')}.` : 'Not enough practice data for weak areas yet.',
    i.to_nudge ? `${i.to_nudge} student(s) could use a nudge (no practice or low readiness).` : 'No students need a nudge right now.',
    ...(i.assignments_pending ? [`${i.assignments_pending} student(s) have not finished ${i.assignments_open ?? 0} practice assignment(s) yet (Placement → Assignments).`] : []),
  ]
  return {
    college: i.college,
    headline: `Weekly placement report — ${i.college}`,
    lines,
    numbers: { students: i.students, active: i.active, readiness_avg: i.readiness_avg, applications_week: i.applications_week, offers_week: i.offers_week, open_drives: i.drives_open.length, closing_soon: soon.length, to_nudge: i.to_nudge, assignments_pending: i.assignments_pending ?? 0 },
  }
}

/** ISO week key "2026-W43". */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = t.getUTCFullYear()
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}
