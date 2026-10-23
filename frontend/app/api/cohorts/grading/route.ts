/** GET — the TA grading queue across the caller's cohorts. */
import type { NextRequest } from 'next/server'
import { errorResponse, json, userGate } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { gradingQueue } = await import('@/lib/cohorts/service')
    return json({ queue: await gradingQueue(g.user) })
  } catch (e) { return errorResponse(e, 'cohort grading queue') }
}
