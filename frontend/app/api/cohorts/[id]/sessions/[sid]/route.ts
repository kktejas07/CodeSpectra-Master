/** PATCH — cancel / restore a session or add its recording link (staff). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-staff', max: 30 })
  if ('res' in g) return g.res
  const { id, sid } = await params
  if (!idOk(id) || !idOk(sid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { updateSession } = await import('@/lib/cohorts/service')
    return json({ session: await updateSession(g.user, id, sid, await bodyOf(req)) })
  } catch (e) { return errorResponse(e, 'cohort session update') }
}
