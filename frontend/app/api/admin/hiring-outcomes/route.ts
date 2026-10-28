/**
 * Hiring outcomes per candidate per test (lib/hiring-outcomes.ts).
 *
 * GET  ?exam_id=X   outcomes for one test (tenant-checked)
 * GET  ?summary=1   counts by status across the caller's tests
 * POST { exam_id, user_ids[], status?, rating?: { period: 30|90|180, value: 1–5, notes? } }
 *      bulk update; every change is appended to the doc's history (who / when).
 *      Only candidates who submitted the test can get an outcome; a rating
 *      needs the candidate to be hired.
 */
import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { recordHiringOutcomes } from '@/lib/services/outcomes'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  OUTCOME_STATUSES, OUTCOMES_COLLECTION, parseOutcomeUpdate, type OutcomeStatus,
} from '@/lib/hiring-outcomes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const url = new URL(request.url)
  const examId = url.searchParams.get('exam_id')
  try {
    const db = await getMongoDb()
    if (examId) {
      const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
      if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
      const outcomes = await db.collection(OUTCOMES_COLLECTION).find({ exam_id: examId }, { projection: { _id: 0 } }).toArray()
      return NextResponse.json({ outcomes })
    }
    // Summary across the caller's tests (superadmin: all).
    const scoped = gate.user.role !== 'superadmin'
    const match: Record<string, unknown> = {}
    if (scoped) {
      const ids = (await db.collection('exams').find({ tenant_id: gate.user.tenantId }, { projection: { _id: 0, id: 1 } }).toArray()).map((e) => String(e.id))
      if (ids.length === 0) return NextResponse.json({ counts: Object.fromEntries(OUTCOME_STATUSES.map((s) => [s, 0])), total: 0 })
      match.exam_id = { $in: ids }
    }
    const rows = await db.collection(OUTCOMES_COLLECTION).aggregate([
      { $match: match },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]).toArray()
    const counts = Object.fromEntries(OUTCOME_STATUSES.map((s) => [s, 0])) as Record<OutcomeStatus, number>
    for (const r of rows) if ((OUTCOME_STATUSES as readonly string[]).includes(String(r._id))) counts[r._id as OutcomeStatus] = Number(r.n) || 0
    return NextResponse.json({ counts, total: Object.values(counts).reduce((a, b) => a + b, 0) })
  } catch (e) {
    console.error('[hiring-outcomes] GET:', e)
    return NextResponse.json({ error: 'Failed to load outcomes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const rl = rateLimitSlidingWindow(`hiring-outcomes:${gate.user.id}`, 60, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests', code: 'too_many_requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const parsed = parseOutcomeUpdate(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    // Tenant check + history-keeping update: lib/services/outcomes (shared with the admin agent).
    const r = await recordHiringOutcomes(gate.user, parsed.value)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  } catch (e) {
    console.error('[hiring-outcomes] POST:', e)
    return NextResponse.json({ error: 'Failed to save outcomes' }, { status: 500 })
  }
}
