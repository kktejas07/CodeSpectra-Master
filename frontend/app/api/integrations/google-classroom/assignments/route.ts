/** POST { course_id, exam_id, title?, max_points?, due_at? } — post a Classroom assignment linking to the test. */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const { postAssignment } = await import('@/lib/integrations/classroom')
    return json({ link: await postAssignment(tenantOf(g.user)!, g.user.id, await bodyOf(req)) }, 201)
  } catch (e) { return errorResponse(e, 'classroom assignment') }
}
