/** POST — add one live session, or { generate: true } to create the weekly schedule (staff). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-staff', max: 20 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const body = await bodyOf(req)
    const svc = await import('@/lib/cohorts/service')
    if (body.generate === true) return json(await svc.generateSessions(g.user, id))
    return json({ session: await svc.addSession(g.user, id, body) }, 201)
  } catch (e) { return errorResponse(e, 'cohort sessions') }
}
