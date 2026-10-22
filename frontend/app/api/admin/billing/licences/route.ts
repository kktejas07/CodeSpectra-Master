import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'
import { MAX_LICENCE_SEATS } from '@/lib/billing/licence-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/billing/licences — every organisation licence (newest first). */
export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { licencesCol } = await import('@/lib/billing/licences')
    const { licences } = await licencesCol()
    const items = await licences.find({ status: { $ne: 'pending' } }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(200).toArray()
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[admin/billing/licences] GET', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

const issueSchema = z.object({
  org_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  seats: z.coerce.number().int().min(1).max(MAX_LICENCE_SEATS),
  currency: z.enum(['INR', 'USD']),
  ends_at: z.string().refine((v) => Date.parse(v) > Date.now(), 'End date must be in the future'),
}).strict()

/** POST /api/admin/billing/licences — issue a licence paid offline (PO / bank transfer). */
export async function POST(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const parsed = issueSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid licence', code: 'invalid_request' }, { status: 400 })
  try {
    const { issueManualLicence } = await import('@/lib/billing/licences')
    const lic = await issueManualLicence({ orgId: parsed.data.org_id, seats: parsed.data.seats, currency: parsed.data.currency, endsAt: new Date(parsed.data.ends_at).toISOString(), actorId: gate.user.id })
    if (!lic) return NextResponse.json({ error: 'That organisation was not found.', code: 'licence_org_not_found' }, { status: 404 })
    await auditAdmin(gate.user, 'admin.licence.issue', 'licence', `licence/${lic.id}`, `${lic.org_id} ${lic.seats} seats`)
    return NextResponse.json({ licence: lic }, { status: 201 })
  } catch (e) {
    console.error('[admin/billing/licences] POST', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
