import { NextResponse } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { licenceGate } from '@/lib/billing/licence-access'
import { licenceSettingsSchema } from '@/lib/billing/licence-rules'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/

/** GET /api/licences/[id] — licence, usage and assigned seats (scoped to the caller's org). */
export async function GET(req: Request, { params }: IdRouteContext) {
  const { id } = await params
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!ID.test(id)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
  try {
    const { getLicence, listSeats, seatUsage } = await import('@/lib/billing/licences')
    const licence = await getLicence(id, g.superadmin ? null : g.orgId)
    if (!licence || (!g.superadmin && licence.org_id !== g.orgId)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const [seats, usage] = await Promise.all([listSeats(id, licence.org_id), seatUsage(id)])
    return NextResponse.json({ licence, usage, seats })
  } catch (e) {
    console.error('[licences/id] GET', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

/** PATCH /api/licences/[id] { email_domains?, auto_assign? } — domain auto-assignment. */
export async function PATCH(req: Request, { params }: IdRouteContext) {
  const { id } = await params
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!ID.test(id)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
  const parsed = licenceSettingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const { updateLicenceSettings, getLicence } = await import('@/lib/billing/licences')
    const existing = await getLicence(id, g.superadmin ? null : g.orgId)
    if (!existing) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const licence = await updateLicenceSettings(id, existing.org_id, parsed.data)
    return NextResponse.json({ licence })
  } catch (e) {
    console.error('[licences/id] PATCH', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
