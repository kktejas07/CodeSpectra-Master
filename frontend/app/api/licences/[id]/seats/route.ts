import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { IdRouteContext } from '@/lib/app-route-context'
import { licenceGate } from '@/lib/billing/licence-access'
import { parseSeatEmails } from '@/lib/billing/licence-rules'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[0-9a-f-]{36}$/
const assignSchema = z.object({ text: z.string().max(600_000) }).strict()
const revokeSchema = z.object({ email: z.string().max(320) }).strict()

/** POST /api/licences/[id]/seats { text } — assign seats from a CSV / pasted email list. */
export async function POST(req: Request, { params }: IdRouteContext) {
  const { id } = await params
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!ID.test(id)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
  const limited = await limitRequest(req, 'licence-seats', g.user.id, 30, 60_000)
  if (limited) return limited
  const parsed = assignSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const list = parseSeatEmails(parsed.data.text)
  if (!list.emails.length) return NextResponse.json({ error: 'No email addresses found.', code: 'licence_no_emails', invalid_rows: list.invalid.slice(0, 50) }, { status: 400 })
  try {
    const { assignSeats, getLicence } = await import('@/lib/billing/licences')
    const lic = await getLicence(id, g.superadmin ? null : g.orgId)
    if (!lic) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const r = await assignSeats(id, lic.org_id, list.emails, g.user.id)
    if (!r) return NextResponse.json({ error: 'This licence is not active.', code: 'licence_not_live' }, { status: 409 })
    return NextResponse.json({ assigned: r.assigned.length, skipped: r.skipped.length, over_limit: r.overLimit.length, over_limit_emails: r.overLimit.slice(0, 50), invalid_rows: list.invalid.slice(0, 50), truncated: list.truncated })
  } catch (e) {
    console.error('[licences/seats] POST', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

/** DELETE /api/licences/[id]/seats { email } — free a seat. */
export async function DELETE(req: Request, { params }: IdRouteContext) {
  const { id } = await params
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!ID.test(id)) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
  const parsed = revokeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const { revokeSeat, getLicence } = await import('@/lib/billing/licences')
    const lic = await getLicence(id, g.superadmin ? null : g.orgId)
    if (!lic) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    const ok = await revokeSeat(id, lic.org_id, parsed.data.email)
    if (!ok) return NextResponse.json(apiErrorFor('not_found'), { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[licences/seats] DELETE', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
