/** GET — roster (staff). POST — add a mentor / TA (admin). DELETE ?user_id= — remove staff (admin). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { roster } = await import('@/lib/cohorts/service')
    return json({ members: await roster(g.user, id) })
  } catch (e) { return errorResponse(e, 'cohort roster') }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-admin', max: 30 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { addStaff } = await import('@/lib/cohorts/service')
    return json(await addStaff(g.user, id, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'cohort staff add') }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-admin', max: 30 })
  if ('res' in g) return g.res
  const { id } = await params
  const uid = new URL(req.url).searchParams.get('user_id')
  if (!idOk(id) || !idOk(uid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { removeStaff } = await import('@/lib/cohorts/service')
    return json(await removeStaff(g.user, id, uid))
  } catch (e) { return errorResponse(e, 'cohort staff remove') }
}
