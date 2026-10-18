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
import { newId, nowIso } from '@/lib/db/ids'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import {
  ensureOutcomeIndexes, OUTCOME_STATUSES, OUTCOMES_COLLECTION, parseOutcomeUpdate, type OutcomeStatus,
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
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })

  const parsed = parseOutcomeUpdate(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { exam_id, user_ids, status, rating } = parsed.value

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', exam_id, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    await ensureOutcomeIndexes(db)

    // Only candidates who took this test.
    const subs = await db.collection('exam_submissions')
      .find({ exam_id, user_id: { $in: user_ids } }, { projection: { _id: 0, user_id: 1, email: 1 } }).toArray()
    const emailByUser = new Map(subs.map((s) => [String(s.user_id), String(s.email || '')]))
    const existing = new Map((await db.collection(OUTCOMES_COLLECTION)
      .find({ exam_id, user_id: { $in: user_ids } }, { projection: { _id: 0 } }).toArray()).map((d) => [String(d.user_id), d]))

    const at = nowIso()
    const by = { by: gate.user.id, by_email: gate.user.email || '' }
    const updated: string[] = []
    const skipped: Array<{ user_id: string; reason: string }> = []

    for (const uid of user_ids) {
      if (!emailByUser.has(uid)) { skipped.push({ user_id: uid, reason: 'No submission for this test' }); continue }
      const prev = existing.get(uid) as Record<string, unknown> | undefined
      const prevStatus = (prev?.status as OutcomeStatus | undefined) ?? null
      const nextStatus = status ?? prevStatus
      if (rating && nextStatus !== 'hired') { skipped.push({ user_id: uid, reason: 'Ratings are for hired candidates' }); continue }
      if (!status && !rating) continue

      const set: Record<string, unknown> = { updated_at: at, email: emailByUser.get(uid) }
      const history: Record<string, unknown>[] = []
      if (status && status !== prevStatus) {
        set.status = status
        history.push({ at, ...by, kind: 'status', from: prevStatus, to: status })
      }
      if (rating) {
        const key = `d${rating.period}`
        const prevRating = (prev?.ratings as Record<string, { value?: number }> | undefined)?.[key]
        set[`ratings.${key}`] = { value: rating.value, ...(rating.notes ? { notes: rating.notes } : {}), ...by, at }
        history.push({ at, ...by, kind: 'rating', period: rating.period, from: prevRating?.value ?? null, to: rating.value, ...(rating.notes ? { notes: rating.notes } : {}) })
      }
      if (history.length === 0) continue
      await db.collection(OUTCOMES_COLLECTION).updateOne(
        { exam_id, user_id: uid },
        {
          $set: set,
          $setOnInsert: { id: newId(), exam_id, user_id: uid, tenant_id: owned.doc.tenant_id ?? null, created_at: at },
          $push: { history: { $each: history, $slice: -200 } },
        } as never,
        { upsert: true },
      )
      updated.push(uid)
    }
    return NextResponse.json({ ok: true, updated, skipped })
  } catch (e) {
    console.error('[hiring-outcomes] POST:', e)
    return NextResponse.json({ error: 'Failed to save outcomes' }, { status: 500 })
  }
}
