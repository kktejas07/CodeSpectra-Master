/**
 * POST /api/admin/certifications/[id]/revoke  { reason }
 *
 * Marks one issued certificate as revoked (revoked_at, revoked_by,
 * revoke_reason). The public verify page then reports it as revoked. Atomic
 * and one-shot: a certificate that is already revoked is left untouched (409).
 *
 * Who: a superadmin (any certificate), or a tenant_admin for certificates
 * issued for a test of their own tenant (`certification_id` = exam id, see
 * canRevokeExamCertificate). Everything else is 403/404. Every revoke is
 * written to the audit log with the reason.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { revokeCertificate, CERT_ID_RE } from '@/lib/services/certificates'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth().catch(() => null)
  if (!gate || 'error' in gate) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = gate.user
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rl = rateLimitSlidingWindow(`cert-revoke:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })

  const { id } = await ctx.params
  if (!id || !CERT_ID_RE.test(id)) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason : ''

  try {
    // Scope rules, one-shot update and audit log: lib/services/certificates (shared with the admin agent).
    const r = await revokeCertificate(user, id, reason, clientLimiterKeyFromRequest(req, null))
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e) {
    console.error('[admin cert revoke]', e)
    return NextResponse.json({ error: 'Could not revoke the certificate. Try again.' }, { status: 500 })
  }
}
