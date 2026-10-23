/**
 * POST /api/admin/problems/[id]/approve — superadmin + admin 2FA (requireSuperAdmin).
 * Republishes a problem that is pending review and re-indexes it for search.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { approvePendingProblem } from '@/lib/problems/learner-review'

export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_.-]{1,200}$/

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const { id } = await ctx.params
  if (!ID_RE.test(id || '')) return NextResponse.json({ error: 'Bad request', code: 'bad_request' }, { status: 400 })
  try {
    const kid = await approvePendingProblem(id, gate.user.id)
    if (!kid) return NextResponse.json({ error: 'Problem not found', code: 'problem_not_found' }, { status: 404 })
    await auditAdmin(gate.user, 'problems.review_approve', 'problem', kid)
    return NextResponse.json({ ok: true, id: kid })
  } catch (e) {
    console.error('[admin/problems/approve]', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
