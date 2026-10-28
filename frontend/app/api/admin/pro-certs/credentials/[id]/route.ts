/** POST /api/admin/pro-certs/credentials/[id] { reason } — revoke an issued credential (verify page then shows it revoked). Superadmin. */
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

const Body = z.object({ reason: z.string().trim().min(3).max(500) }).strict()

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const { id } = await ctx.params
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: 'Add a reason for revoking.', code: 'pro_cert_reason_required' }, 400)
  try {
    const { revokeCredential } = await import('@/lib/pro-certs/service')
    const c = await revokeCredential(id, g.user.id, b.data.reason)
    await auditAdmin(g.user, 'pro_cert.revoke', 'pro_cert_credential', c.id, b.data.reason, 'warning')
    return json({ ok: true })
  } catch (e) {
    return errorJson(e, 'revoke')
  }
}
