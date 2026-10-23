/**
 * GET  /api/campus/college   the caller's college + campus role (superadmin: ?college=<tenant id>, or the list)
 * POST /api/campus/college   onboard / update the college profile (organisation admin or superadmin)
 */
import { NextResponse } from 'next/server'
import { bad, guarded, loadStaffContext, readJson, unauthorized, withUser } from '@/lib/campus/access'
import { onboardCollege } from '@/lib/campus/service'
import { collegesCol } from '@/lib/campus/store'
import { isAdminCaller, isSuperAdminCaller } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return guarded('college GET', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    const requested = new URL(req.url).searchParams.get('college')
    if (isSuperAdminCaller(user) && !requested) {
      const rows = await (await collegesCol()).find({}, { projection: { _id: 0, tenant_id: 1, name: 1, slug: 1, city: 1 } }).sort({ name: 1 }).limit(500).toArray()
      return NextResponse.json({ college: null, role: 'superadmin', colleges: rows, can_onboard: true })
    }
    const ctx = await loadStaffContext(user, requested)
    if (!ctx) return NextResponse.json({ college: null, role: null, can_onboard: user.role === 'tenant_admin' && isAdminCaller(user) })
    return NextResponse.json({ college: ctx.college, role: ctx.role, can_onboard: ctx.role !== 'placement_officer' })
  })
}

export async function POST(req: Request) {
  return guarded('college POST', async () => {
    const user = await withUser()
    if (!user) return unauthorized()
    if (!isAdminCaller(user)) return bad('Only an organisation admin can set up a college', 403)
    const college = await onboardCollege(user, await readJson(req))
    return NextResponse.json({ college })
  })
}
