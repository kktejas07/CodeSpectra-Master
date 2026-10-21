/** GET /api/ats/screening?application_id= — all screening calls of an application (newest first). */
import { NextRequest, NextResponse } from 'next/server'
import { parseId, requireAts, tenantFromRequest } from '@/lib/ats/access'
import { callsCol } from '@/lib/ats/screening/store'
import { loadVisibleApp, publicCall, SCREENING_VIEW_ROLES } from '@/lib/ats/screening/route-helpers'
import type { ScreeningCallDoc } from '@/lib/ats/screening/types'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const gate = await requireAts([...SCREENING_VIEW_ROLES], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const appId = parseId(new URL(req.url).searchParams.get('application_id'))
  if (!appId) return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  try {
    if (!(await loadVisibleApp(gate.actor, appId))) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    const calls = (await (await callsCol())
      .find({ tenant_id: gate.actor.tenantId, application_id: appId }, { projection: { _id: 0 } })
      .sort({ created_at: -1 }).limit(50).toArray()) as ScreeningCallDoc[]
    return NextResponse.json({ calls: calls.map(publicCall) })
  } catch (e) {
    console.error('[ats/screening/list] failed:', e)
    return NextResponse.json({ error: 'Could not load screenings' }, { status: 500 })
  }
}
