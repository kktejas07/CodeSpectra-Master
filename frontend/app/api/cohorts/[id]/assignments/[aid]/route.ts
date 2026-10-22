/** PATCH — replace an assignment's settings (staff). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; aid: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-staff', max: 30 })
  if ('res' in g) return g.res
  const { id, aid } = await params
  if (!idOk(id) || !idOk(aid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { saveAssignment } = await import('@/lib/cohorts/service')
    return json({ assignment: await saveAssignment(g.user, id, await bodyOf(req), aid) })
  } catch (e) { return errorResponse(e, 'cohort assignment update') }
}
