/** PUT /api/campus/college/structure  { departments?, batches? } — placement team. */
import { NextResponse } from 'next/server'
import { guarded, loadStaffContext, readJson, withStaff } from '@/lib/campus/access'
import { setBatches, setDepartments } from '@/lib/campus/service'

export const runtime = 'nodejs'

export async function PUT(req: Request) {
  return guarded('structure PUT', () => withStaff(req, async (ctx) => {
    const body = await readJson(req)
    if (body.departments !== undefined) ctx.college.departments = await setDepartments(ctx, body.departments)
    if (body.batches !== undefined) {
      // Reload so batches can point at departments created in the same request.
      const fresh = await loadStaffContext(ctx.user, ctx.college.tenant_id)
      ctx.college.batches = await setBatches(fresh ?? ctx, body.batches)
    }
    return NextResponse.json({ departments: ctx.college.departments, batches: ctx.college.batches })
  }))
}
