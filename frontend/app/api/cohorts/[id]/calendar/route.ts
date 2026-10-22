/** GET — the cohort's live sessions as an .ics file (members and staff). */
import type { NextRequest } from 'next/server'
import { errJson, errorResponse, idOk, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  const { id } = await params
  if (!idOk(id)) return errJson(404, 'Cohort not found', 'cohort_not_found')
  try {
    const { cohortCalendar } = await import('@/lib/cohorts/service')
    const ics = await cohortCalendar(g.user, id)
    return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="cohort-sessions.ics"', 'Cache-Control': 'private, no-store' } })
  } catch (e) { return errorResponse(e, 'cohort calendar') }
}
