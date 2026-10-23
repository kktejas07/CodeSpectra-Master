/** POST — issue completion certificates to every learner who meets the rule (admin or mentor). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-admin', max: 5 })
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { issueCertificates } = await import('@/lib/cohorts/service')
    return json(await issueCertificates(g.user, id))
  } catch (e) { return errorResponse(e, 'cohort certificates') }
}
