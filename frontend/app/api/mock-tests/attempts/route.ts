/**
 * /api/mock-tests/attempts
 *   GET  -> the caller's attempts (submitted + open), paginated on the server.
 *           ?page=&page_size=&company=&role=&status=all|submitted|in_progress
 *           &sort=date|score&order=asc|desc. Also returns filter facets and a
 *           score trend (last 30 submitted, oldest first). No answer key.
 *   POST -> submit answers for a session created by /api/mock-tests/generate.
 *           Graded on the server against the stored answer key; a session can
 *           only be submitted once. Returns the score plus the answer key and
 *           explanations for the review screen.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import type { Filter } from 'mongodb'
import { mockTestSessions, type MockTestSessionDoc } from '../_sessions'
import { buildHistoryFilter, buildHistorySort, parseHistoryQuery, toHistoryRow } from '../_history'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionDoc = MockTestSessionDoc

const submitSchema = z.object({
  session_id: z.string().min(1).max(100),
  // question index -> chosen option index; skipped questions are omitted
  answers: z.record(z.string().regex(/^\d{1,3}$/), z.number().int().min(0).max(3)),
})

const progressSchema = z.object({
  session_id: z.string().min(1).max(100),
  answers: z.record(z.string().regex(/^\d{1,3}$/), z.number().int().min(0).max(3)),
  index: z.number().int().min(0).max(999),
  started_at: z.number().int().positive().nullable().optional(),
})

/**
 * PATCH -> autosave answers in progress for the caller's own open attempt, so
 * a reload on another device resumes where they left off. Never grades.
 */
export async function PATCH(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = await rateLimitRedis(`mock-tests:autosave:${gate.user.id}`, 120, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many saves' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } })
  }

  let parsed: z.infer<typeof progressSchema>
  try {
    parsed = progressSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid progress' }, { status: 400 })
  }
  if (Object.keys(parsed.answers).length > 200) {
    return NextResponse.json({ error: 'Invalid progress' }, { status: 400 })
  }

  const col = await mockTestSessions()
  // The start time can only be set once, and never in the future.
  const now = Date.now()
  const session = await col.findOne(
    { id: parsed.session_id, user_id: gate.user.id, submitted_at: null, abandoned_at: { $exists: false } },
    { projection: { _id: 0, progress: 1, created_at: 1 } },
  )
  if (!session) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  const created = Date.parse(session.created_at)
  const requestedStart = typeof parsed.started_at === 'number' ? Math.min(parsed.started_at, now) : null
  const startedAt = session.progress?.started_at
    ?? (requestedStart !== null && Number.isFinite(created) ? Math.max(requestedStart, created) : requestedStart)

  const res = await col.updateOne(
    { id: parsed.session_id, user_id: gate.user.id, submitted_at: null, abandoned_at: { $exists: false } },
    { $set: { progress: { answers: parsed.answers, index: parsed.index, started_at: startedAt, saved_at: new Date(now).toISOString() } } },
  )
  if (res.matchedCount === 0) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  return NextResponse.json({ saved: true })
}

export async function GET(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const q = parseHistoryQuery(new URL(req.url).searchParams)
  const now = Date.now()
  try {
    const col = await mockTestSessions()
    const filter = buildHistoryFilter(gate.user.id, q, now) as Filter<SessionDoc>
    const projection = {
      _id: 0, id: 1, company: 1, role: 1, difficulty: 1, score: 1, total: 1, percentage: 1,
      created_at: 1, submitted_at: 1, 'progress.started_at': 1, 'questions.id': 1,
    }
    // Trend + facets ignore pagination/status so the chart and filters stay stable while paging.
    const trendFilter = buildHistoryFilter(gate.user.id, { company: q.company, role: q.role, status: 'submitted' }, now) as Filter<SessionDoc>
    const facetFilter = buildHistoryFilter(gate.user.id, { company: null, role: null, status: 'all' }, now) as Filter<SessionDoc>
    const [total, rows, trendRows, companies, roles] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection }).sort(buildHistorySort(q)).skip((q.page - 1) * q.pageSize).limit(q.pageSize).toArray(),
      col.find(trendFilter, { projection: { _id: 0, id: 1, percentage: 1, submitted_at: 1 } }).sort({ submitted_at: -1 }).limit(30).toArray(),
      col.distinct('company', facetFilter),
      col.distinct('role', facetFilter),
    ])

    return NextResponse.json({
      items: rows.map((r) => toHistoryRow(r as SessionDoc)),
      page: q.page,
      page_size: q.pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.pageSize)),
      facets: {
        companies: (companies as string[]).filter(Boolean).sort().slice(0, 200),
        roles: (roles as string[]).filter(Boolean).sort().slice(0, 200),
      },
      trend: trendRows.reverse().map((r) => ({ id: r.id, percentage: r.percentage ?? 0, submitted_at: r.submitted_at })),
    })
  } catch (e) {
    console.error('[mock-tests attempts] GET', e)
    return NextResponse.json({ error: 'Could not load your attempts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = await rateLimitRedis(`mock-tests:submit:${gate.user.id}`, 20, 10 * 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again in a few minutes.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let parsed: z.infer<typeof submitSchema>
  try {
    parsed = submitSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid submission' }, { status: 400 })
  }

  const col = await mockTestSessions()
  const session = await col.findOne({ id: parsed.session_id, user_id: gate.user.id }, { projection: { _id: 0 } })
  if (!session) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  if (session.submitted_at) return NextResponse.json({ error: 'This test was already submitted' }, { status: 409 })
  if (session.abandoned_at || !session.questions?.length) {
    return NextResponse.json({ error: 'This test was replaced by a newer one.' }, { status: 409 })
  }

  const total = session.questions.length
  let score = 0
  const answers: Record<string, number> = {}
  session.questions.forEach((q, i) => {
    const a = parsed.answers[String(i)]
    if (typeof a === 'number') {
      answers[String(i)] = a
      if (a === q.correctIndex) score++
    }
  })
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0

  // Atomic: only the first submit for this session wins.
  const updated = await col.updateOne(
    { id: session.id, user_id: gate.user.id, submitted_at: null, abandoned_at: { $exists: false } },
    {
      $set: { submitted_at: new Date().toISOString(), answers, score, total, percentage },
      // Frees the in-progress slot: the next start for this test is a new attempt.
      $unset: { in_progress_key: '' },
    },
  )
  if (updated.matchedCount === 0) {
    return NextResponse.json({ error: 'This test was already submitted' }, { status: 409 })
  }

  return NextResponse.json({
    score,
    total,
    percentage,
    review: session.questions.map((q) => ({ correctIndex: q.correctIndex, explanation: q.explanation })),
  })
}
