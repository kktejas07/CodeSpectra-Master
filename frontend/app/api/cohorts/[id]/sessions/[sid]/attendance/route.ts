/** GET — attendance sheet (staff). PUT — [{ user_id, status }] marks (staff). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id, sid } = await params
  if (!idOk(id) || !idOk(sid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { sessionAttendance } = await import('@/lib/cohorts/service')
    return json({ rows: await sessionAttendance(g.user, id, sid) })
  } catch (e) { return errorResponse(e, 'cohort attendance') }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-staff', max: 30 })
  if ('res' in g) return g.res
  const { id, sid } = await params
  if (!idOk(id) || !idOk(sid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const body = await bodyOf(req)
    const { setAttendance } = await import('@/lib/cohorts/service')
    return json(await setAttendance(g.user, id, sid, body.entries))
  } catch (e) { return errorResponse(e, 'cohort attendance set') }
}
