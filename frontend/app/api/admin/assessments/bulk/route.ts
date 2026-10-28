/**
 * Bulk candidate invites for one assessment (audits CORE-009 / CORE-010).
 *
 * POST { examId, candidates: [{ email, name?, company?, role? }], deadline?, durationMinutes?, message? }
 *   Superadmin, or a company admin for their own tenant's tests. ≤ 500 rows,
 *   counted against the plan's monthly invite limit. Stores the invites and
 *   returns at once; e-mails are sent from a queue (lib/services/bulk-invites.ts).
 *   → { batch_id, created: [{ id, email, delivery_status }], errors: [{ email, reason }] }
 *
 * GET ?examId=…&batch=… → per-invite delivery status of that batch (polled by the page).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { auditAdmin } from '@/lib/admin-audit'
import { batchStatus, createBulkInvites, sendQueuedInvites } from '@/lib/services/bulk-invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(request, 'bulk-invites', gate.user.id, 10, 60_000)
  if (limited) return limited

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const examId = typeof body?.examId === 'string' ? body.examId : ''
    if (!ID_RE.test(examId)) return NextResponse.json({ error: 'examId is required' }, { status: 400 })

    const db = await getMongoDb()
    // Company admins only for their own organisation's tests.
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error === 'Not found' ? 'Assessment not found' : owned.error }, { status: owned.status })

    const res = await createBulkInvites(db, {
      exam: owned.doc as unknown as { id: string; title?: unknown; tenant_id?: unknown },
      actor: { id: gate.user.id, role: gate.user.role, tenantId: gate.user.tenantId ?? null },
      candidates: body?.candidates,
      deadline: body?.deadline,
      durationMinutes: body?.durationMinutes,
      message: body?.message,
    })
    if (!res.ok) {
      return NextResponse.json({ error: res.error, ...(res.code ? { code: res.code, limit: res.limit, remaining: res.remaining } : {}) }, { status: res.status })
    }
    if (res.created.length) {
      await auditAdmin(gate.user, 'admin.assessment.bulk_invite', 'exam', `exam/${examId}`, `${res.created.length} invites, batch ${res.batch_id}`)
      // Start sending now without holding the response; the scheduler finishes anything left.
      void sendQueuedInvites(db, { batchId: res.batch_id, limit: 500, budgetMs: 120_000 })
        .catch((e) => console.error('[bulk-invites] drain failed:', (e as Error)?.message))
    }
    return NextResponse.json({
      batch_id: res.batch_id,
      created: res.created.length,
      failed: res.errors.length,
      invites: res.created,
      errors: res.errors,
    })
  } catch (e) {
    console.error('[bulk-invites] POST error:', (e as Error)?.message)
    return NextResponse.json({ error: 'Bulk invite failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const examId = request.nextUrl.searchParams.get('examId') || ''
  const batch = request.nextUrl.searchParams.get('batch') || ''
  if (!ID_RE.test(examId) || !ID_RE.test(batch)) return NextResponse.json({ error: 'examId and batch required' }, { status: 400 })
  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    return NextResponse.json(await batchStatus(db, examId, batch))
  } catch (e) {
    console.error('[bulk-invites] GET error:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not load invite status' }, { status: 500 })
  }
}
