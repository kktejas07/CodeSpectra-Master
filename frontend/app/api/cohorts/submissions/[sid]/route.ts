/** GET — one submission with its assignment (staff). POST — rubric grade + feedback (staff). */
import type { NextRequest } from 'next/server'
import { bodyOf, errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ sid: string }> }
const missing = () => errJson(404, 'Submission not found', 'cohort_submission_missing')

export async function GET(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { sid } = await params
  if (!idOk(sid)) return missing()
  try {
    const { submissionForGrading } = await import('@/lib/cohorts/service')
    return json(await submissionForGrading(g.user, sid))
  } catch (e) { return errorResponse(e, 'cohort submission') }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const g = await userGate(req, { write: true, bucket: 'cohort-grade', max: 60 })
  if ('res' in g) return g.res
  const { sid } = await params
  if (!idOk(sid)) return missing()
  try {
    const { gradeSubmission } = await import('@/lib/cohorts/service')
    return json(await gradeSubmission(g.user, sid, await bodyOf(req)))
  } catch (e) { return errorResponse(e, 'cohort grade') }
}
