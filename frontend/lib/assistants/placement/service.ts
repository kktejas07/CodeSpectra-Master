/**
 * Placement officer assistant (server only). Everything runs inside one
 * college's StaffContext (lib/campus/access) — the college comes from the
 * caller's session, never from model output — and reuses the campus services
 * (readiness signals, drives, applicants). Writes (nudges, practice
 * assignments) only run from a confirmed copilot proposal.
 *
 *   placement_assignments  { id, college_id, pattern_id, student_ids[], created_by, created_at }
 *                          read back by listAssignments (campus console "Assignments" tab and
 *                          the weekly report), completion from company_test_attempts (CORE-048)
 */
import 'server-only'
import { lazyCollection } from '@/lib/community/lazy'
import { newId, nowIso } from '@/lib/db/ids'
import { logger } from '@/lib/logger'
import type { StaffContext } from '@/lib/campus/access'
import { activeMarks, getAssistantSettings, markOnce, recordRun, releaseMark } from '../store'
import { assignmentProgress, type AssignmentAttempt, type AssignmentProgress, type AssignmentStudent } from './assignments'
import { buildPlacementReport, isoWeek, NUDGE_DEFAULTS, rankShortlist, selectNudges, type NudgeReason, type PlacementReport } from './select'

interface AssignmentDoc { id: string; college_id: string; pattern_id: string; student_ids: string[]; created_by: string; created_at: string }
const assignmentsCol = lazyCollection<AssignmentDoc>('placement_assignments', (c) => Promise.all([
  c.createIndex({ id: 1 }, { unique: true, name: 'placement_assignments_id' }),
  c.createIndex({ college_id: 1, created_at: -1 }, { name: 'placement_assignments_college' }),
]))

export const MAX_NUDGE = 200

/** Every student of the college with readiness (and the user id, server-side only). */
async function readinessRows(ctx: StaffContext, f: { department?: string | null; batch?: string | null } = {}) {
  const [{ studentsCol }, { loadSignals, MAX_USERS }, { computeReadiness }] = await Promise.all([import('@/lib/campus/store'), import('@/lib/campus/signals'), import('@/lib/campus/readiness')])
  const q: Record<string, unknown> = { college_id: ctx.college.tenant_id }
  if (f.department) q.department_id = f.department
  if (f.batch) q.batch_id = f.batch
  const students = await (await studentsCol()).find(q, { projection: { _id: 0, id: 1, name: 1, department_id: 1, batch_id: 1, user_id: 1 } }).sort({ name: 1 }).limit(MAX_USERS).toArray()
  const signals = await loadSignals(students.map((s) => s.user_id).filter((x): x is string => !!x))
  const r = computeReadiness(students, signals)
  const uid = new Map(students.map((s) => [s.id, s.user_id]))
  return { ...r, rows: r.students.map((s) => ({ ...s, user_id: uid.get(s.student_id) ?? null })) }
}

export async function studentsToNudge(ctx: StaffContext, opts: { department?: string | null; batch?: string | null; threshold?: number; max?: number; reasons?: NudgeReason[] } = {}, now = new Date()) {
  const r = await readinessRows(ctx, opts)
  const cooling = await activeMarks('placement', r.rows.map((s) => `nudge:${s.student_id}`), now)
  const sel = selectNudges(r.rows.map((s) => ({ ...s, last_nudged_at: cooling.has(`nudge:${s.student_id}`) ? now.toISOString() : null })), { threshold: opts.threshold, max: opts.max, now, reasons: opts.reasons })
  return { ...sel, students: r.rows.length, overall: r.overall }
}

export async function driveShortlist(ctx: StaffContext, driveId: string, limit = 30) {
  const { getDrive, driveApplicants } = await import('@/lib/campus/drives')
  const drive = await getDrive(ctx, driveId)
  const apps = await driveApplicants(ctx, drive)
  const r = await readinessRows(ctx)
  const ready = new Map(r.rows.map((s) => [s.student_id, s.readiness]))
  const rows = rankShortlist(apps.map((a) => ({ student_id: a.student_id, name: a.name, status: a.status, cgpa: a.cgpa, test_percent: a.test?.percent ?? null, readiness: ready.get(a.student_id) ?? null })), limit)
  return { drive: { id: drive.id, title: drive.title, company: drive.company.name, status: drive.status, mode: drive.process.mode }, applicants: apps.length, rows }
}

export interface AssignmentRow extends AssignmentProgress {
  id: string
  pattern_id: string
  test: string
  created_at: string
}

/** Recent practice assignments of this college with completion (CORE-048). */
export async function listAssignments(ctx: StaffContext, limit = 20): Promise<AssignmentRow[]> {
  const rows = await (await assignmentsCol()).find({ college_id: ctx.college.tenant_id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(50, Math.max(1, limit))).toArray()
  if (!rows.length) return []
  const [{ studentsCol }, { attempts, getPattern }] = await Promise.all([import('@/lib/campus/store'), import('@/lib/company-tests/db')])
  const ids = [...new Set(rows.flatMap((r) => r.student_ids))].slice(0, 5000)
  const students = await (await studentsCol()).find({ college_id: ctx.college.tenant_id, id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1, user_id: 1 } }).toArray()
  const byId = new Map(students.filter((x) => !!x.user_id).map((x) => [x.id, { student_id: x.id, user_id: String(x.user_id), name: String(x.name || '') }]))
  const uids = [...new Set([...byId.values()].map((x) => x.user_id))]
  const oldest = rows[rows.length - 1].created_at
  const patternIds = [...new Set(rows.map((r) => r.pattern_id))]
  const tries = uids.length
    ? (await (await attempts()).find({ userId: { $in: uids }, patternId: { $in: patternIds }, createdAt: { $gte: oldest } }, { projection: { _id: 0, userId: 1, patternId: 1, status: 1, createdAt: 1 } }).limit(20_000).toArray()) as unknown as AssignmentAttempt[]
    : []
  const names = new Map<string, string>()
  for (const pid of patternIds) {
    const p = await getPattern(pid).catch(() => null)
    names.set(pid, p ? `${p.companyName} ${p.examName}` : pid)
  }
  return rows.map((r) => ({
    id: r.id, pattern_id: r.pattern_id, test: names.get(r.pattern_id) || r.pattern_id, created_at: r.created_at,
    ...assignmentProgress(r, r.student_ids.map((sid) => byId.get(sid)).filter((x): x is AssignmentStudent => !!x), tries),
  }))
}

export async function placementReport(ctx: StaffContext, now = new Date()): Promise<PlacementReport> {
  const [{ listDrives }, { applicationsCol, offersCol }] = await Promise.all([import('@/lib/campus/drives'), import('@/lib/campus/store')])
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const [nudge, drives, apps, offers, assignments] = await Promise.all([
    studentsToNudge(ctx, {}, now),
    listDrives(ctx, 'open'),
    (await applicationsCol()).countDocuments({ college_id: ctx.college.tenant_id, applied_at: { $gte: weekAgo } }),
    (await offersCol()).countDocuments({ college_id: ctx.college.tenant_id, created_at: { $gte: weekAgo } }),
    listAssignments(ctx, 10).catch(() => [] as AssignmentRow[]),
  ])
  return buildPlacementReport({
    college: ctx.college.name, students: nudge.students, active: nudge.overall.active, readiness_avg: nudge.overall.readiness_avg,
    weak_areas: nudge.overall.weak_areas, drives_open: drives.map((d) => ({ title: d.title, apply_by: d.schedule.apply_by, applicants: d.applicants })),
    applications_week: apps, offers_week: offers, to_nudge: nudge.picks.length,
    assignments_pending: assignments.reduce((n, a) => n + a.pending, 0), assignments_open: assignments.filter((a) => a.pending > 0).length,
  }, now)
}

/** Students of THIS college by id → those with an account (others are reported, not messaged). */
async function ownStudents(ctx: StaffContext, ids: readonly string[]) {
  const { studentsCol } = await import('@/lib/campus/store')
  const rows = await (await studentsCol()).find({ college_id: ctx.college.tenant_id, id: { $in: [...new Set(ids)].slice(0, MAX_NUDGE) } }, { projection: { _id: 0, id: 1, name: 1, user_id: 1 } }).toArray()
  return { withAccount: rows.filter((r): r is typeof r & { user_id: string } => !!r.user_id), missing: ids.length - rows.length, noAccount: rows.filter((r) => !r.user_id).length }
}

export async function previewStudents(ctx: StaffContext, ids: readonly string[]) {
  const s = await ownStudents(ctx, ids)
  return { reachable: s.withAccount.length, names: s.withAccount.slice(0, 12).map((r) => r.name), not_joined: s.noAccount, not_in_college: s.missing }
}

/** Nudge students (in-app + e-mail in their language, honouring their preferences). One per student per cooldown. */
export async function nudgeStudents(ctx: StaffContext, ids: readonly string[], kind: 'practice' | 'drive', driveTitle: string | null, now = new Date()) {
  const s = await ownStudents(ctx, ids)
  const { notify } = await import('@/lib/notifications')
  let sent = 0, skipped = 0, held = 0
  for (const st of s.withAccount) {
    if (!(await markOnce('placement', `nudge:${st.id}`, NUDGE_DEFAULTS.cooldownDays, now))) { skipped++; continue }
    // An engagement nudge: through the shared per-person cap (AUTO-094 / CORE-046); null = held.
    const r = await notify({
      budget: { class: 'engagement', topic: 'placement-nudge', object: `${kind}:${now.toISOString().slice(0, 10)}`, source: 'placement-assistant' },
      user_id: st.user_id, type: 'placement.nudge',
      title: kind === 'drive' ? 'A placement drive is open' : 'Time to practise for placements',
      title_i18n: { key: kind === 'drive' ? 'assistantPlacementDriveTitle' : 'assistantPlacementNudgeTitle' },
      message_i18n: kind === 'drive' && driveTitle ? { key: 'assistantPlacementDriveBody', params: { college: ctx.college.name, drive: driveTitle.slice(0, 80) } } : { key: 'assistantPlacementNudgeBody', params: { college: ctx.college.name } },
      link: kind === 'drive' ? '/dashboard/campus' : '/dashboard/company-tests', send_email: true,
    })
    if (r) sent++
    else {
      // Held (limit, or already told today): free the 7-day cooldown so the officer can try again (AGT-046).
      held++
      await releaseMark('placement', `nudge:${st.id}`).catch(() => {})
    }
  }
  await recordRun({ assistant: 'placement', trigger: 'copilot', status: 'ok', tenant_id: ctx.college.tenant_id, message: `Nudged ${sent} student(s)${skipped ? `, ${skipped} nudged recently` : ''}${held ? `, ${held} held by the message limit (cooldown not used, can be nudged again)` : ''}`, counts: { sent, skipped, held, not_joined: s.noAccount } })
  return { sent, skipped, held, not_joined: s.noAccount, not_in_college: s.missing }
}

/** Assign a company-specific practice test (a company exam pattern) to students and tell them. */
export async function assignPractice(ctx: StaffContext, ids: readonly string[], patternId: string, now = new Date()) {
  const { getPattern } = await import('@/lib/company-tests/db')
  const pat = await getPattern(patternId)
  if (!pat || (pat as { active?: boolean }).active === false) throw new Error('That company test is not available')
  const s = await ownStudents(ctx, ids)
  const id = newId()
  await (await assignmentsCol()).insertOne({ id, college_id: ctx.college.tenant_id, pattern_id: pat.id, student_ids: s.withAccount.map((x) => x.id), created_by: ctx.user.id, created_at: nowIso() })
  const { notify } = await import('@/lib/notifications')
  let sent = 0
  for (const st of s.withAccount) {
    const r = await notify({
      user_id: st.user_id, type: 'placement.practice_assigned',
      title: `Practice: ${pat.companyName} ${pat.examName}`,
      title_i18n: { key: 'assistantPlacementPracticeTitle', params: { test: `${pat.companyName} ${pat.examName}`.slice(0, 80) } },
      message_i18n: { key: 'assistantPlacementPracticeBody', params: { college: ctx.college.name } },
      link: `/dashboard/company-tests/${encodeURIComponent(pat.id)}`, send_email: true,
    })
    if (r) sent++
  }
  void now
  await recordRun({ assistant: 'placement', trigger: 'copilot', status: 'ok', tenant_id: ctx.college.tenant_id, message: `Assigned ${pat.companyName} ${pat.examName} to ${sent} student(s)`, counts: { sent, not_joined: s.noAccount } })
  return { assignment_id: id, sent, not_joined: s.noAccount, test: `${pat.companyName} ${pat.examName}` }
}

/**
 * Weekly loop (Mondays): for each college, the report goes to the college's
 * organisation admins (in-app + e-mail) and into their copilot together with a
 * "nudge these students" proposal. Off unless messaging is switched on.
 */
export async function runPlacementLoop(now = new Date(), trigger: 'cron' | 'manual' = 'cron') {
  const s = await getAssistantSettings('placement')
  const started = now.toISOString()
  if (!s.enabled || !s.messaging_enabled) return recordRun({ assistant: 'placement', trigger, status: 'skipped', started_at: started, message: !s.enabled ? 'Switched off' : 'Weekly report e-mails are off', counts: {}, tenant_id: null })
  const [{ collegesCol }, { getMongoDb }, { notify }, { postProposals }] = await Promise.all([import('@/lib/campus/store'), import('@/lib/mongodb'), import('@/lib/notifications'), import('../proactive')])
  const db = await getMongoDb()
  const week = isoWeek(now)
  const colleges = await (await collegesCol()).find({}, { projection: { _id: 0 } }).limit(200).toArray()
  let reports = 0, proposals = 0, failed = 0
  for (const college of colleges) {
    try {
      if (!(await markOnce('placement', `report:${college.tenant_id}:${week}`, 8, now))) continue
      const admins = await db.collection('user').find({ role: 'tenant_admin', $or: [{ tenantId: college.tenant_id }, { organizationId: college.tenant_id }] }, { projection: { id: 1, _id: 1, email: 1, name: 1 } }).limit(3).toArray()
      if (!admins.length) continue
      const admin = admins[0]
      const adminId = String(admin.id ?? admin._id)
      const ctx: StaffContext = { user: { id: adminId, email: String(admin.email || ''), role: 'tenant_admin', tenantId: college.tenant_id }, college, role: 'college_admin' }
      const report = await placementReport(ctx, now)
      for (const a of admins) {
        await notify({
          user_id: String(a.id ?? a._id), type: 'placement.weekly_report', title: report.headline, message: report.lines.slice(0, 2).join(' '),
          title_i18n: { key: 'assistantPlacementReportTitle', params: { college: college.name } },
          message_i18n: { key: 'assistantPlacementReportBody', params: { active: report.numbers.active ?? 0, students: report.numbers.students ?? 0, applications: report.numbers.applications_week ?? 0, offers: report.numbers.offers_week ?? 0, nudge: report.numbers.to_nudge ?? 0 } },
          link: '/dashboard/admin/agent', send_email: true,
        })
      }
      const nudge = await studentsToNudge(ctx, { max: 50 }, now)
      const posted = await postProposals(
        { userId: adminId, role: 'tenant_admin', tenantId: college.tenant_id, email: String(admin.email || '') },
        report.headline,
        `${report.headline}\n\n${report.lines.map((l) => `- ${l}`).join('\n')}${nudge.picks.length ? '\n\nI drafted a nudge for the students below; confirm it to send.' : ''}`,
        nudge.picks.length ? [{ tool: 'nudge_students', args: { student_ids: nudge.picks.map((p) => p.student_id), kind: 'practice' } }] : [],
      )
      reports++
      proposals += posted.action_ids.length
      void import('@/lib/automation/events').then(({ emit }) => emit('placement.report_ready', { college_id: college.tenant_id, week, students: report.numbers.students, active: report.numbers.active, to_nudge: report.numbers.to_nudge }, { tenantId: college.tenant_id, idempotencyKey: `placement.report_ready:${college.tenant_id}:${week}` })).catch(() => null)
    } catch (e) {
      failed++
      logger.warn(`[assistants] placement report ${String(college.tenant_id).slice(0, 8)}: ${(e as Error)?.message}`)
    }
  }
  return recordRun({ assistant: 'placement', trigger, status: failed && !reports ? 'failed' : failed ? 'partial' : 'ok', started_at: started, tenant_id: null, message: `${reports} weekly report(s), ${proposals} nudge proposal(s)${failed ? `, ${failed} failed` : ''}`, counts: { colleges: colleges.length, reports, proposals, failed } })
}
