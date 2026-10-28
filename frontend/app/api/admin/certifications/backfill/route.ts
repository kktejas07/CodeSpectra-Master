/**
 * POST /api/admin/certifications/backfill   (superadmin)
 *   body: { cursor?: string, limit?: number (1–25 exams, default 10) }
 *
 * Issues missing assessment certificates across all exams, a page of exams at
 * a time: every candidate whose best released attempt meets the exam's pass
 * mark (examPassPercent) and has no certificate yet. Idempotent — safe to
 * re-run; one certificate per exam + candidate (issue_key). Candidates are
 * told once on first issue. Call again with `next_cursor` until it is null.
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { issueMissingExamCertificates } from '@/lib/db/certifications'
import { examPassPercent } from '@/lib/exam-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = await rateLimitRedis(`cert-backfill:${gate.user.id}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.', code: 'rate_limited_minute' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const cursor = typeof body.cursor === 'string' && body.cursor.length > 0 && body.cursor.length <= 200 ? body.cursor : null
  if (body.cursor != null && !cursor) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  const rawLimit = Math.floor(Number(body.limit))
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(25, rawLimit)) : 10

  try {
    const db = await getMongoDb()
    // Only exams that have at least one released submission and certificates on.
    const examIds = (await db.collection('exam_submissions').distinct('exam_id', {
      $or: [{ score_released: true }, { released_at: { $nin: [null, ''] } }],
    } as Record<string, unknown>))
      .filter((id): id is string => typeof id === 'string' && !!id && (!cursor || id > cursor))
      .sort()

    const page = examIds.slice(0, limit)
    const exams = page.length
      ? await db.collection('exams')
          .find({ id: { $in: page }, issue_certificates: { $ne: false } }, { projection: { _id: 0, questions: 0, questionList: 0 } })
          .toArray()
      : []
    const byId = new Map(exams.map((e) => [String(e.id), e as Record<string, unknown>]))

    const totals = { exams: 0, checked: 0, issued: 0, existing: 0, failed: 0 }
    for (const id of page) {
      const exam = byId.get(id)
      if (!exam) continue
      totals.exams++
      try {
        const c = await issueMissingExamCertificates(db, exam, examPassPercent(exam))
        totals.checked += c.checked
        totals.issued += c.issued
        totals.existing += c.existing
        totals.failed += c.failed
      } catch (e) {
        totals.failed++
        console.error('[cert backfill] exam failed:', id, e)
      }
    }

    const nextCursor = examIds.length > limit ? page[page.length - 1] : null
    return NextResponse.json({ ...totals, next_cursor: nextCursor, remaining_exams: Math.max(0, examIds.length - page.length) })
  } catch (e) {
    console.error('[cert backfill] error:', e)
    return NextResponse.json({ error: 'Could not run the certificate backfill' }, { status: 500 })
  }
}
