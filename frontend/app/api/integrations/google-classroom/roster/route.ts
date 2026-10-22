/** GET ?course_id= — imported roster. POST { course_id } — import (or refresh) the course roster. */
import type { NextRequest } from 'next/server'
import { adminGate, bodyOf, errorResponse, json, tenantOf } from '@/lib/community/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await adminGate(req)
  if ('res' in g) return g.res
  try {
    const { roster } = await import('@/lib/integrations/classroom')
    return json({ students: await roster(tenantOf(g.user)!, new URL(req.url).searchParams.get('course_id')) })
  } catch (e) { return errorResponse(e, 'classroom roster') }
}

export async function POST(req: NextRequest) {
  const g = await adminGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    const body = await bodyOf(req)
    const { importRoster } = await import('@/lib/integrations/classroom')
    return json(await importRoster(tenantOf(g.user)!, body.course_id))
  } catch (e) { return errorResponse(e, 'classroom roster import') }
}
