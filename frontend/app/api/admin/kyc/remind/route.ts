import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { writeAuditLog } from '@/lib/db/misc'
import { clientIpOrEmpty } from '@/lib/client-ip'

export const runtime = 'nodejs'

/**
 * POST /api/admin/kyc/remind — send a KYC reminder or re-verification
 * email to a user. Body: { userId: string, type: 'reminder' | 'reverify' }.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { userId?: string; type?: string }
  try {
    body = (await req.json()) as { userId?: string; type?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const userId = (body.userId || '').trim()
  const type = body.type === 'reverify' ? 'reverify' : body.type === 'reminder' ? 'reminder' : ''
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  if (!type) return NextResponse.json({ error: "type must be 'reminder' or 'reverify'" }, { status: 400 })

  const db = await getMongoDb()
  const target = await db.collection('user').findOne(
    { $or: [{ id: userId }, { _id: userId as any }] },
    { projection: { id: 1, email: 1, fullName: 1, name: 1, tenantId: 1, organizationId: 1, tenant_id: 1 } },
  ) as { id?: string; email?: string; fullName?: string; name?: string; tenantId?: string; organizationId?: string; tenant_id?: string } | null
  if (!target?.email) {
    return NextResponse.json({ error: 'User not found or has no email' }, { status: 404 })
  }
  // tenant_admin may only email users in their own tenant (a missing tenantId never matches).
  if (gate.user.role !== 'superadmin') {
    const targetTenant = target.tenantId ?? target.organizationId ?? target.tenant_id ?? null
    if (!gate.user.tenantId || targetTenant !== gate.user.tenantId) {
      return NextResponse.json({ error: 'User not found or has no email' }, { status: 404 })
    }
  }

  const name = String(target.fullName || target.name || 'there').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  // SEO-033: in the user's language, not the admin's.
  const [{ emailTemplatesFor }, { localeForUser }] = await Promise.all([import('@/lib/email-templates'), import('@/lib/i18n/recipient')])
  const { subject, html } = emailTemplatesFor(await localeForUser(target.id || userId)).notice({ key: type === 'reminder' ? 'kycReminder' : 'kycReverify', params: { name } })

  const result = await sendEmail(target.email, { subject, html }, undefined, { category: 'transactional' })
  if (!result.success) {
    console.error('[admin/kyc/remind] send failed:', result.error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 502 })
  }

  const actorIp = clientIpOrEmpty(req)
  await writeAuditLog({
    action: type === 'reminder' ? 'admin.kyc.reminder' : 'admin.kyc.reverify',
    outcome: 'success',
    actor: gate.user.id,
    actorIp,
    resource: 'user/' + userId,
    resourceType: 'kyc',
    severity: 'info',
    user_id: userId,
    detail: `${type} email sent to ${target.email}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
