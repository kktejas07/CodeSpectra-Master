/**
 * GET /api/admin/predictive-validity[?exam_id=X]
 *
 * Computed from real data: hiring outcomes recorded by staff
 * (hiring_outcomes) joined to each candidate's latest submission of the same
 * test. Maths and definitions: lib/hiring-outcomes.ts (buildValidityReport).
 * Tenant-scoped: tenant admins only see their own tests; superadmins all.
 * Submissions still waiting for grading are left out (their score isn't final).
 * Logic: lib/services/validity (shared with the admin agent).
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getPredictiveValidity } from '@/lib/services/validity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const examFilter = new URL(request.url).searchParams.get('exam_id') || null
  try {
    const r = await getPredictiveValidity(gate.user, examFilter)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e) {
    console.error('[predictive-validity] GET:', e)
    return NextResponse.json({ error: 'Failed to compute predictive validity' }, { status: 500 })
  }
}
