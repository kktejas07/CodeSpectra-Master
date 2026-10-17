/**
 * POST /api/admin/certifications/[id]/revoke  { reason }
 *
 * Superadmin only. Marks one issued certificate as revoked (revoked_at,
 * revoked_by, revoke_reason). The public verify page then reports it as
 * revoked. Atomic and one-shot: a certificate that is already revoked is left
 * untouched (409). Certificates are platform-issued (no tenant owner), so the
 * superadmin gate is the tenant boundary; tenant admins never reach this.
 */
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { requireSuperAdmin } from '@/lib/route-auth'
import { certificationAttempts } from '@/lib/db/certifications'
import { rateLimitSlidingWindow, clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { writeAuditLog, auditLogAction } from '@/lib/db/misc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/
const MIN_REASON = 5
const MAX_REASON = 500

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = rateLimitSlidingWindow(`cert-revoke:${gate.user.id}`, 30, 60_000)
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
    const now = new Date().toISOString()
    const updated = await col.findOneAndUpdate(
      { $or: idMatch, passed: true, revoked_at: null } as Record<string, unknown>,
      { $set: { revoked_at: now, revoked_by: gate.user.id, revoke_reason: reason } },
      { returnDocument: 'after', projection: { _id: 0, id: 1, revoked_at: 1 } },
    )
    if (!updated) {
      const exists = await col.findOne({ $or: idMatch } as Record<string, unknown>, { projection: { revoked_at: 1 } })
      if (!exists) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
      return NextResponse.json({ error: 'This certificate is already revoked.' }, { status: 409 })
    }

    await writeAuditLog(
      auditLogAction(
        'certificate.revoke',
        'success',
        gate.user.id,
        clientLimiterKeyFromRequest(req, null),
        id,
        'certificate',
        'warning',
        reason,
      ),
    )

    return NextResponse.json({ ok: true, id, revokedAt: updated.revoked_at })
  } catch (e) {
    console.error('[admin cert revoke]', e)
    return NextResponse.json({ error: 'Could not revoke the certificate. Try again.' }, { status: 500 })
  }
}
