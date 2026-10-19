import { NextRequest, NextResponse } from 'next/server'
import { auditAts, getAccessSettings, requireAts, setAccessSettings, tenantFromRequest } from '@/lib/ats/access'

/** GET/PATCH /api/ats/team/settings — tenant access switches (admin). */
export async function GET(req: NextRequest) {
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  return NextResponse.json({ settings: await getAccessSettings(gate.actor.tenantId) })
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  let body: Record<string, unknown>
  try {
    const raw = await req.json()
    body = raw && typeof raw === 'object' ? raw : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const patch: Record<string, boolean> = {}
  for (const k of ['recruiters_see_all_jobs', 'client_sees_contacts'] as const) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== 'boolean') return NextResponse.json({ error: `${k} must be true or false` }, { status: 400 })
      patch[k] = body[k] as boolean
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  try {
    const settings = await setAccessSettings(gate.actor.tenantId, patch)
    await auditAts(gate.actor, 'ats.settings.access', 'ats_settings', gate.actor.tenantId, JSON.stringify(patch), req)
    return NextResponse.json({ settings })
  } catch (e) {
    console.error('[ats/team/settings] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }
}
