/** POST — join a live session: meeting link or built-in video token; records attendance. */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; sid: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-join', max: 20 })
  if ('res' in g) return g.res
  const { id, sid } = await params
  if (!idOk(id) || !idOk(sid)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { joinSession } = await import('@/lib/cohorts/service')
    return json(await joinSession(g.user, id, sid))
  } catch (e) { return errorResponse(e, 'cohort session join') }
}
