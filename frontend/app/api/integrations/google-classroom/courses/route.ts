/** GET — the connected teacher's active Classroom courses (+ imported roster size). */
import type { NextRequest } from 'next/server'
import { adminGate, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const { listCourses } = await import('@/lib/integrations/classroom')
    return json({ courses: await listCourses(tenantOf(g.user)!) })
  } catch (e) { return errorResponse(e, 'classroom courses') }
}
