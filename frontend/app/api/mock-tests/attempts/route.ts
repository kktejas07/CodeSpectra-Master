/**
 * /api/mock-tests/attempts
 *   GET  -> the caller's submitted mock-test attempts (newest first, no questions)
 *   POST -> submit answers for a session created by /api/mock-tests/generate.
 *           Graded on the server against the stored answer key; a session can
 *           only be submitted once. Returns the score plus the answer key and
 *           explanations for the review screen.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { MOCK_TEST_SESSIONS } from '@/lib/mock-tests'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StoredQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

interface SessionDoc {
  id: string
  user_id: string
  company: string
  role: string
  difficulty: string
  questions: StoredQuestion[]
  created_at: string
  submitted_at: string | null
  answers?: Record<string, number>
  score?: number
  total?: number
  percentage?: number
}

const submitSchema = z.object({
  session_id: z.string().min(1).max(100),
  // question index -> chosen option index; skipped questions are omitted
  answers: z.record(z.string().regex(/^\d{1,3}$/), z.number().int().min(0).max(3)),
})

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const db = await getMongoDb()
  const rows = await db
    .collection<SessionDoc>(MOCK_TEST_SESSIONS)
    .find(
      { user_id: gate.user.id, submitted_at: { $ne: null } },
      { projection: { _id: 0, id: 1, company: 1, role: 1, difficulty: 1, score: 1, total: 1, percentage: 1, submitted_at: 1 } },
    )
    .sort({ submitted_at: -1 })
    .limit(50)
    .toArray()

  return NextResponse.json({ items: rows })
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

  const db = await getMongoDb()
  const col = db.collection<SessionDoc>(MOCK_TEST_SESSIONS)
  const session = await col.findOne({ id: parsed.session_id, user_id: gate.user.id }, { projection: { _id: 0 } })
  if (!session) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  if (session.submitted_at) return NextResponse.json({ error: 'This test was already submitted' }, { status: 409 })

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
    { id: session.id, user_id: gate.user.id, submitted_at: null },
    { $set: { submitted_at: new Date().toISOString(), answers, score, total, percentage } },
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
