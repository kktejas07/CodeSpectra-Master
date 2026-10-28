/** GET — cohorts the caller can see (+ their role). POST — create a cohort (organisation admin / superadmin). */
import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { listCohorts } = await import('@/lib/cohorts/service')
    return json({ cohorts: await listCohorts(g.user) })
  } catch (e) { return errorResponse(e, 'cohorts list') }
}

export async function POST(req: NextRequest) {
  const g = await userGate(req, { write: true, bucket: 'cohort-admin', max: 20 })
  if ('res' in g) return g.res
  try {
    const { createCohort } = await import('@/lib/cohorts/service')
    return json({ cohort: await createCohort(g.user, await bodyOf(req)) }, 201)
  } catch (e) { return errorResponse(e, 'cohorts create') }
}
