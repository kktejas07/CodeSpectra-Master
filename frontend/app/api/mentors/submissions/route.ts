/** GET — the learner's recent practice submissions (to attach to a code review session). */
import type { NextRequest } from 'next/server'
import { errorResponse, json, userGate } from '@/lib/mentors/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await userGate(req)
  if ('res' in g) return g.res
  try {
    const { attachableSubmissions } = await import('@/lib/mentors/sessions')
    return json({ submissions: await attachableSubmissions(g.user.id) })
  } catch (e) {
    return errorResponse(e, 'mentor submissions')
  }
}
