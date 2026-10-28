/**
 * Read tools for the wave-15 assistants (lib/assistants):
 *  - list_students_to_nudge     placement: students with no practice / low readiness       college staff
 *  - shortlist_for_drive        placement: applicants ranked by drive test + readiness      college staff
 *  - get_placement_report       placement: the weekly placement report, now                  college staff
 *  - list_company_practice_tests  company exam patterns to assign as practice               admins
 *  - get_onboarding_checklist   org onboarding: setup steps done / next                       organisation admin
 *  - list_revenue_signals       revenue: renewals, failed payments, licences, seats, usage   superadmin
 *  - get_assistant_activity     run log of all five assistants                               superadmin
 * The college / organisation always comes from the caller's session.
 */
import { ToolPermissionError, type AgentCaller } from '@/lib/agent/contract'
import type { APIUser } from '@/lib/route-auth'
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optNumber, optString, reqId } from '../args'
import { clip } from '../output'

const SUPER = ['superadmin'] as const

export async function staffFor(caller: AgentCaller) {
  const { loadStaffContext } = await import('@/lib/campus/access')
  const user = { id: caller.userId, email: caller.email || '', role: caller.role, tenantId: caller.tenantId } as APIUser
  const ctx = await loadStaffContext(user, caller.tenantId)
  if (!ctx) throw new ToolPermissionError(caller.role === 'superadmin' ? 'Pick a college organisation first (scope the assistant to it).' : 'Your organisation is not set up as a college. Open Campus → Set up your college.')
  const { getAssistantSettings } = await import('@/lib/assistants/store')
  if (!(await getAssistantSettings('placement')).enabled) throw new ToolPermissionError('The placement assistant is switched off (Admin → Assistants).')
  return ctx
}

const deptName = (ctx: Awaited<ReturnType<typeof staffFor>>, id: string | null) => ctx.college.departments.find((d) => d.id === id)?.name ?? null
const batchName = (ctx: Awaited<ReturnType<typeof staffFor>>, id: string | null) => ctx.college.batches.find((b) => b.id === id)?.name ?? null

export const listStudentsToNudgeTool = readTool({
  name: 'list_students_to_nudge',
  description: 'Placement: your college\'s joined students who have not practised at all or whose readiness is under a threshold (default 40), lowest first, leaving out anyone nudged in the last 7 days. Use before nudge_students. Optional department_id / batch_id.',
  parameters: {
    type: 'object',
    properties: {
      department_id: { type: 'string', maxLength: 40 }, batch_id: { type: 'string', maxLength: 40 },
      threshold: { type: 'number', minimum: 0, maximum: 100 }, limit: { type: 'integer', minimum: 1, maximum: 200 },
      reason: { type: 'string', enum: ['any', 'inactive', 'low_readiness'] },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['department_id', 'batch_id', 'threshold', 'limit', 'reason'])
    return {
      department: optString(r, 'department_id', { max: 40 }) ?? null, batch: optString(r, 'batch_id', { max: 40 }) ?? null,
      threshold: optNumber(r, 'threshold', 0, 100), limit: optInt(r, 'limit', 1, 200) ?? 100,
      reason: optEnum(r, 'reason', ['any', 'inactive', 'low_readiness'] as const) ?? 'any',
    }
  },
  async run(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const { studentsToNudge } = await import('@/lib/assistants/placement/service')
    const r = await studentsToNudge(staff, { department: a.department, batch: a.batch, threshold: a.threshold, max: a.limit, reasons: a.reason === 'any' ? undefined : [a.reason] })
    return {
      data: {
        college: staff.college.name, students: r.students, to_nudge: r.picks.length, not_joined: r.not_joined, nudged_recently: r.cooling_down,
        // student ids are for nudge_students; no emails or CGPAs.
        picks: r.picks.slice(0, 60).map((p) => ({ student_id: p.student_id, name: clip(p.name, 60), reason: p.reason, readiness: p.readiness })),
        link: '/dashboard/placement?tab=readiness',
      },
    }
  },
})

export const shortlistForDriveTool = readTool({
  name: 'shortlist_for_drive',
  description: 'Placement: rank a drive\'s applicants by their company-test result on the drive (60%) and readiness (40%). Read-only — change application status on the drive page. drive_id from list_placement_drives.',
  parameters: { type: 'object', properties: { drive_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['drive_id'] },
  parse(raw) {
    const r = argsObject(raw, ['drive_id', 'limit'])
    return { drive_id: reqId(r, 'drive_id'), limit: optInt(r, 'limit', 1, 100) ?? 30 }
  },
  async run(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const { driveShortlist } = await import('@/lib/assistants/placement/service')
    const r = await driveShortlist(staff, a.drive_id, a.limit)
    return {
      data: {
        drive: { ...r.drive, title: clip(r.drive.title, 120), company: clip(r.drive.company, 80) }, applicants: r.applicants,
        ranked: r.rows.map((x, i) => ({ rank: i + 1, student_id: x.student_id, name: clip(x.name, 60), status: x.status, score: x.score, basis: x.basis, drive_test: x.test_percent, readiness: x.readiness })),
        link: `/dashboard/placement/drives/${r.drive.id}`,
      },
    }
  },
})

export const getPlacementReportTool = readTool({
  name: 'get_placement_report',
  description: 'Placement: this week\'s placement report for your college — practice participation, readiness, applications and offers this week, open drives closing soon, weak areas and how many students need a nudge.',
  parameters: { type: 'object', properties: {} },
  parse(raw) { argsObject(raw, []); return {} },
  async run(_a, ctx) {
    const staff = await staffFor(ctx.caller)
    const { placementReport } = await import('@/lib/assistants/placement/service')
    return { data: { ...(await placementReport(staff)), link: '/dashboard/placement' } }
  },
})

export const listCompanyPracticeTestsTool = readTool({
  name: 'list_company_practice_tests',
  description: 'Company-specific practice tests (exam patterns such as TCS NQT, Infosys) students can take; use the id with assign_company_practice. Optional company name filter.',
  parameters: { type: 'object', properties: { company: { type: 'string', maxLength: 60 } } },
  parse(raw) {
    const r = argsObject(raw, ['company'])
    return { company: optString(r, 'company', { max: 60 })?.toLowerCase() ?? null }
  },
  async run(a) {
    const { listPatterns } = await import('@/lib/company-tests/db')
    const rows = (await listPatterns({ activeOnly: true })).filter((p) => !a.company || p.companyName.toLowerCase().includes(a.company) || p.companySlug.includes(a.company))
    return { data: { total: rows.length, tests: rows.slice(0, 40).map((p) => ({ id: p.id, company: clip(p.companyName, 60), exam: clip(p.examName, 60), sections: p.sections.length, cutoff_percent: p.cutoffPercent, verified: p.verified })) } }
  },
})

export const getOnboardingChecklistTool = readTool({
  name: 'get_onboarding_checklist',
  description: 'Your organisation\'s setup checklist (profile, team invites, first test / invite / job, students and first drive for colleges, connected apps): which steps are done, the next one and where to do it. Offer to draft the next step as a proposal.',
  parameters: { type: 'object', properties: {} },
  parse(raw) { argsObject(raw, []); return {} },
  async run(_a, ctx) {
    if (!ctx.caller.tenantId) throw new ToolPermissionError('Pick an organisation first (scope the assistant to it).')
    const { getAssistantSettings } = await import('@/lib/assistants/store')
    if (!(await getAssistantSettings('org_onboarding')).enabled) throw new ToolPermissionError('The onboarding assistant is switched off (Admin → Assistants).')
    const { getOnboarding } = await import('@/lib/assistants/onboarding/service')
    const v = await getOnboarding(ctx.caller.tenantId)
    return { data: { organisation: clip(v.org_name, 80), kind: v.checklist.kind, done: v.checklist.done, total: v.checklist.total, next: v.checklist.next, steps: v.checklist.steps.map((s) => ({ step: s.id, done: s.done, where: s.href })), link: '/dashboard/admin/onboarding' } }
  },
})

export const listRevenueSignalsTool = readTool({
  name: 'list_revenue_signals',
  roles: [...SUPER],
  description: 'Revenue: plans ending soon (no auto-renew), failed renewal payments, organisation licences ending, licences nearly out of seats, organisations near their monthly assessment limit, recently lapsed plans and coupons nearly used up — highest priority first. Draft send_renewal_reminder / send_upgrade_offer / send_winback_offer from these.',
  parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['any', 'renewal', 'payment', 'licence', 'seats', 'usage', 'winback', 'coupon'] }, window_days: { type: 'integer', minimum: 1, maximum: 90 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['kind', 'window_days', 'limit'])
    return { kind: optEnum(r, 'kind', ['any', 'renewal', 'payment', 'licence', 'seats', 'usage', 'winback', 'coupon'] as const) ?? 'any', window: optInt(r, 'window_days', 1, 90), limit: optInt(r, 'limit', 1, 50) ?? 25 }
  },
  async run(a) {
    const [{ getAssistantSettings }, { collectSignals }] = await Promise.all([import('@/lib/assistants/store'), import('@/lib/assistants/revenue/service')])
    const s = await getAssistantSettings('revenue')
    const all = await collectSignals(new Date(), a.window ?? s.window_days)
    const rows = all.filter((x) => a.kind === 'any' || x.kind === a.kind)
    return {
      data: {
        total: rows.length,
        signals: rows.slice(0, a.limit).map((x) => ({ kind: x.kind, label: clip(x.label, 140), priority: x.priority, subject: x.subject, [x.subject === 'org' ? 'org_id' : x.subject === 'user' ? 'user_id' : 'coupon_id']: x.subject_id, signal_key: x.key, facts: x.facts, suggested_tool: x.tool })),
      },
    }
  },
})

export const getAssistantActivityTool = readTool({
  name: 'get_assistant_activity',
  roles: [...SUPER],
  description: 'The assistants (support chat, org onboarding, placement, mentor matching, revenue): on/off, last runs and what they did. Optional assistant id.',
  parameters: { type: 'object', properties: { assistant: { type: 'string', enum: ['any', 'support', 'org_onboarding', 'placement', 'mentor_match', 'revenue'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['assistant', 'limit'])
    return { assistant: optEnum(r, 'assistant', ['any', 'support', 'org_onboarding', 'placement', 'mentor_match', 'revenue'] as const) ?? 'any', limit: optInt(r, 'limit', 1, 50) ?? 15 }
  },
  async run(a) {
    const { getAllAssistantSettings, listRuns, runStats } = await import('@/lib/assistants/store')
    const [settings, runs, stats] = await Promise.all([getAllAssistantSettings(), listRuns(a.assistant === 'any' ? null : a.assistant, a.limit), runStats(7)])
    return {
      data: {
        assistants: Object.entries(settings).map(([id, s]) => ({ id, enabled: s.enabled, messaging: s.messaging_enabled, ai: s.ai_enabled, last_7_days: stats[id] ?? { runs: 0, failed: 0, last_at: null } })),
        runs: runs.map((r) => ({ assistant: r.assistant, trigger: r.trigger, status: r.status, at: r.started_at, message: clip(r.message, 200) })),
        link: '/dashboard/admin/assistants',
      },
    }
  },
})

export const ASSISTANT_READ_TOOLS = [
  listStudentsToNudgeTool, shortlistForDriveTool, getPlacementReportTool, listCompanyPracticeTestsTool,
  getOnboardingChecklistTool, listRevenueSignalsTool, getAssistantActivityTool,
]
