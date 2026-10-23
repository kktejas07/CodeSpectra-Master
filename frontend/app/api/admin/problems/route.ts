/**
 * Admin → Problems review (SEC-037 follow-up). Superadmin only (requireSuperAdmin enforces admin 2FA).
 *  GET ?status=pending_review  problems waiting for review (no creator PII)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, gateErrorBody } from '@/lib/route-auth'
import { listPendingReviewProblems } from '@/lib/problems/learner-review'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const status = request.nextUrl.searchParams.get('status') || 'pending_review'
  if (status !== 'pending_review') return NextResponse.json({ error: 'Bad request', code: 'bad_request' }, { status: 400 })
  try {
    return NextResponse.json({ items: await listPendingReviewProblems() })
  } catch (e) {
    console.error('[admin/problems] GET:', (e as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'server_error' }, { status: 500 })
  }
}
