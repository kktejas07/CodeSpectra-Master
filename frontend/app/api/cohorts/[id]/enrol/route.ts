/** POST — enrol (free / licence / plan / paid order). DELETE — leave the cohort. */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-enrol', max: 10 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { enrol } = await import('@/lib/cohorts/service')
    return json(await enrol(g.user, id))
  } catch (e) { return errorResponse(e, 'cohort enrol') }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-enrol', max: 10 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { leave } = await import('@/lib/cohorts/service')
    return json(await leave(g.user, id))
  } catch (e) { return errorResponse(e, 'cohort leave') }
}
