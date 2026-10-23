/**
 * Extended-time accommodations for one test (lib/exam-accommodations.ts).
 * Staff only: the test's author, a tenant admin of its tenant, or a superadmin.
 * GET → { grants, audit }
 * POST { user_id? | email?, kind: 'percent', percent } | { …, kind: 'minutes', extra_minutes }, reason → grant / change
 * DELETE { user_id, reason } → revoke
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { IdRouteContext } from '@/lib/app-route-context'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { isExamStaff } from '@/lib/exam-access'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorBody, apiErrorFor } from '@/lib/api-errors'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Gate = { res: NextResponse } | { user: { id: string; role: string; tenantId?: string | null }; examId: string }

async function gate(params: IdRouteContext['params']): Promise<Gate> {
  const a = await requireAuth()
  if ('error' in a) return { res: NextResponse.json({ error: a.error, code: 'unauthorized' }, { status: a.status }) }
  const { id } = await params
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { res: NextResponse.json(apiErrorBody('Exam not found', 'exam_not_found'), { status: 404 }) }
  const db = await getMongoDb()
  const exam = (await db.collection('exams').findOne({ id }, { projection: { _id: 0, id: 1, tenant_id: 1, created_by: 1 } })) as Record<string, unknown> | null
  if (!exam) return { res: NextResponse.json(apiErrorBody('Exam not found', 'exam_not_found'), { status: 404 }) }
  const author = typeof exam.created_by === 'string' && exam.created_by === a.user.id
  if (!author && !isExamStaff(a.user, exam)) return { res: NextResponse.json(apiErrorBody('Forbidden', 'forbidden'), { status: 403 }) }
  return { user: a.user, examId: id }
}

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/

export async function GET(_req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(params)
  if ('res' in g) return g.res
  const { listAccommodations } = await import('@/lib/exam-accommodations')
  return NextResponse.json(await listAccommodations(await getMongoDb(), g.examId), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(params)
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'exam-accommodations', g.user.id, 120, 60 * 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const { parseGrant, grantAccommodation } = await import('@/lib/exam-accommodations')
  const parsed = parseGrant(body)
  if (!parsed.ok) return NextResponse.json(apiErrorFor(parsed.code), { status: 400 })
  const db = await getMongoDb()
  let userId = typeof body?.user_id === 'string' && USER_ID.test(body.user_id) ? body.user_id : null
  if (!userId && typeof body?.email === 'string' && body.email.includes('@')) {
    const u = await db.collection('user').findOne({ email: body.email.trim().toLowerCase().slice(0, 254) }, { projection: { id: 1, _id: 1 } })
    userId = u ? String(u.id || u._id) : null
  }
  if (!userId) return NextResponse.json(apiErrorFor('accommodation_candidate_not_found'), { status: 404 })
  const doc = await grantAccommodation(db, g.examId, userId, parsed.grant, g.user.id)
  await auditAdmin(g.user, 'exam.accommodation.grant', 'exam', g.examId, JSON.stringify({ user_id: userId, percent: doc.percent, extra_minutes: doc.extra_minutes }))
  return NextResponse.json({ grant: doc }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: IdRouteContext) {
  const g = await gate(params)
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'exam-accommodations', g.user.id, 120, 60 * 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const userId = typeof body?.user_id === 'string' && USER_ID.test(body.user_id) ? body.user_id : null
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!userId) return NextResponse.json(apiErrorBody('Invalid request', 'invalid_request'), { status: 400 })
  if (reason.length < 3) return NextResponse.json(apiErrorFor('accommodation_reason_required'), { status: 400 })
  const { revokeAccommodation } = await import('@/lib/exam-accommodations')
  const ok = await revokeAccommodation(await getMongoDb(), g.examId, userId, g.user.id, reason)
  if (!ok) return NextResponse.json(apiErrorBody('Not found', 'not_found'), { status: 404 })
  await auditAdmin(g.user, 'exam.accommodation.revoke', 'exam', g.examId, JSON.stringify({ user_id: userId }))
  return NextResponse.json({ ok: true })
}
