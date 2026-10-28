/**
 * Read tools for college placement teams: placement drives and batch
 * readiness. The college comes from the caller's organisation (tenant
 * admin of a college tenant; superadmin must be scoped to one). No student
 * emails, CGPAs or offer amounts of individuals in the output.
 */
import { ToolPermissionError } from '@/lib/agent/contract'
import type { APIUser } from '@/lib/route-auth'
import { loadStaffContext } from '@/lib/campus/access'
import { batchReadiness, listDrives } from '@/lib/campus/drives'
import { DRIVE_STATUSES } from '@/lib/campus/types'
import { readTool } from '../define'
import { argsObject, optEnum, optString } from '../args'
import { clip } from '../output'
import type { AgentCaller } from '@/lib/agent/contract'

async function staffFor(caller: AgentCaller) {
  const user = { id: caller.userId, email: caller.email || '', role: caller.role, tenantId: caller.tenantId } as APIUser
  const ctx = await loadStaffContext(user, caller.tenantId)
  if (!ctx) throw new ToolPermissionError(caller.role === 'superadmin' ? 'Pick a college organisation first (scope the assistant to it).' : 'Your organisation is not set up as a college. Open Campus → Set up your college.')
  return ctx
}

export const listPlacementDrivesTool = readTool({
  name: 'list_placement_drives',
  description: 'List your college\'s campus placement drives (company, role, status, apply-by date, applicant count). Filter by status.',
  parameters: {
    type: 'object',
    properties: { status: { type: 'string', enum: [...DRIVE_STATUSES, 'any'], description: 'Default any.' } },
  },
  parse(raw) {
    const r = argsObject(raw, ['status'])
    return { status: optEnum(r, 'status', [...DRIVE_STATUSES, 'any'] as const) ?? 'any' }
  },
  async run(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const rows = await listDrives(staff, a.status === 'any' ? null : a.status)
    return {
      data: {
        college: staff.college.name,
        total: rows.length,
        drives: rows.slice(0, 50).map((d) => ({
          id: d.id, title: clip(d.title, 120), company: clip(d.company.name, 80), role: clip(d.role_title, 80), status: d.status,
          apply_by: d.schedule.apply_by, process: d.process.mode, applicants: d.applicants,
          link: `/dashboard/placement/drives/${d.id}`,
        })),
      },
    }
  },
})

export const getBatchReadinessTool = readTool({
  name: 'get_batch_readiness',
  description: 'Placement readiness for your college by department and batch: active students, average company-test and adaptive-test scores, contest participation, weak areas and top performers. Optional department / batch id (from the placement console).',
  parameters: {
    type: 'object',
    properties: {
      department_id: { type: 'string', maxLength: 40 },
      batch_id: { type: 'string', maxLength: 40 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['department_id', 'batch_id'])
    return { department: optString(r, 'department_id', { max: 40 }) ?? null, batch: optString(r, 'batch_id', { max: 40 }) ?? null }
  },
  async run(a, ctx) {
    const staff = await staffFor(ctx.caller)
    const r = await batchReadiness(staff, a)
    const dept = (id: string | null) => staff.college.departments.find((d) => d.id === id)?.name ?? 'No department'
    const batch = (id: string | null) => staff.college.batches.find((b) => b.id === id)?.name ?? 'No batch'
    const g = (x: typeof r.overall) => ({
      students: x.students, active: x.active, readiness_avg: x.readiness_avg, company_test_avg: x.company_avg,
      company_pass_rate: x.company_pass_rate, adaptive_avg: x.adaptive_avg, contest_entries: x.contest_entries,
      weak_areas: x.weak_areas, top: x.top.map((t) => ({ name: clip(t.name, 60), readiness: t.readiness })),
    })
    return {
      data: {
        college: staff.college.name,
        overall: g(r.overall),
        groups: r.groups.slice(0, 40).map((x) => ({ department: dept(x.department_id), batch: batch(x.batch_id), ...g(x) })),
        truncated: r.truncated,
        link: '/dashboard/placement?tab=readiness',
      },
    }
  },
})
