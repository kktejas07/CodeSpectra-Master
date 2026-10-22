/** GET — cohort page data. PATCH — edit (organisation admin). */
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
    const { cohortView } = await import('@/lib/cohorts/service')
    return json(await cohortView(g.user, id))
  } catch (e) { return errorResponse(e, 'cohort view') }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-admin', max: 30 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { updateCohort } = await import('@/lib/cohorts/service')
    return json({ cohort: await updateCohort(g.user, id, await bodyOf(req)) })
  } catch (e) { return errorResponse(e, 'cohort update') }
}
