/**
 * POST /api/admin/pro-certs/reviews/[attemptId] { action: 'approve' | 'reject', note }
 * Approve issues the credential; reject records an integrity rejection (the
 * learner can retry after the cooldown). A note is required to reject.
 */
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { errorJson, json } from '@/lib/pro-certs/http'
import { auditAdmin } from '@/lib/admin-audit'

export const dynamic = 'force-dynamic'

const Body = z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(2000).default('') }).strict()

export async function POST(req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  const g = await requireSuperAdmin()
  if ('error' in g) return json({ error: g.error }, g.status)
  const { attemptId } = await ctx.params
  if (!/^[A-Za-z0-9-]{8,64}$/.test(attemptId)) return json({ error: 'Attempt not found.', code: 'pro_cert_attempt_not_found' }, 404)
  const b = Body.safeParse(await req.json().catch(() => null))
  if (!b.success) return json({ error: 'Choose approve or reject.', code: 'pro_cert_review_action_invalid' }, 400)
  if (b.data.action === 'reject' && !b.data.note) return json({ error: 'Add a note explaining the rejection.', code: 'pro_cert_note_required' }, 400)
  try {
    const { decideReview } = await import('@/lib/pro-certs/service')
    const a = await decideReview(attemptId, g.user.id, b.data.action === 'approve', b.data.note)
    await auditAdmin(g.user, `pro_cert.review_${b.data.action}`, 'pro_cert_attempt', attemptId, a.program_slug, 'warning')
    return json({ ok: true })
  } catch (e) {
    return errorJson(e, 'review decide')
  }
}
