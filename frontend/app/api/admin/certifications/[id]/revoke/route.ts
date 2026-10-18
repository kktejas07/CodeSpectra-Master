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
import { ObjectId } from 'mongodb'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { certificationAttempts } from '@/lib/db/certifications'
import { canRevokeExamCertificate } from '@/lib/exam-access'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { writeAuditLog, auditLogAction } from '@/lib/db/misc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/
const MIN_REASON = 5
const MAX_REASON = 500

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
  if (!id || !ID_RE.test(id)) return NextResponse.json({ error: 'Invalid certificate id' }, { status: 400 })

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < MIN_REASON) {
    return NextResponse.json({ error: `Give a reason (at least ${MIN_REASON} characters).` }, { status: 400 })
  }
  if (reason.length > MAX_REASON) {
    return NextResponse.json({ error: `Keep the reason under ${MAX_REASON} characters.` }, { status: 400 })
  }

  // Older rows may only have a Mongo _id (the issued list falls back to it).
  const idMatch: Record<string, unknown>[] = [{ id }]
  if (ObjectId.isValid(id) && id.length === 24) idMatch.push({ _id: new ObjectId(id) })

  try {
    const col = await certificationAttempts()
    const cert = await col.findOne(
      { $or: idMatch } as Record<string, unknown>,
      { projection: { _id: 0, id: 1, certification_id: 1, revoked_at: 1, passed: 1 } },
    )
    // Tenant scope: the certificate's exam must belong to the admin's tenant.
    // Out-of-scope certificates answer 404, like missing ones.
    let exam: Record<string, unknown> | null = null
    if (cert && user.role !== 'superadmin' && typeof cert.certification_id === 'string') {
      const db = await getMongoDb()
      exam = (await db.collection('exams').findOne(
        { id: cert.certification_id },
        { projection: { _id: 0, id: 1, tenant_id: 1 } },
      )) as Record<string, unknown> | null
    }
    if (!cert || !canRevokeExamCertificate(user, cert as unknown as Record<string, unknown>, exam)) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
    }
    if (cert.revoked_at) return NextResponse.json({ error: 'This certificate is already revoked.' }, { status: 409 })

    const now = new Date().toISOString()
    const updated = await col.findOneAndUpdate(
      { $or: idMatch, passed: true, revoked_at: null } as Record<string, unknown>,
      { $set: { revoked_at: now, revoked_by: user.id, revoke_reason: reason } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, revoked_at: 1 } },
    )
    if (!updated) return NextResponse.json({ error: 'This certificate is already revoked.' }, { status: 409 })

    await writeAuditLog({
      ...auditLogAction(
        'certificate.revoke',
        'success',
        user.id,
        clientLimiterKeyFromRequest(req, null),
        id,
        'certificate',
        'warning',
        reason,
      ),
      tenant_id: user.role === 'tenant_admin' ? user.tenantId ?? null : null,
    })

    return NextResponse.json({ ok: true, id, revokedAt: updated.revoked_at })
  } catch (e) {
    console.error('[admin cert revoke]', e)
    return NextResponse.json({ error: 'Could not revoke the certificate. Try again.' }, { status: 500 })
  }
}
