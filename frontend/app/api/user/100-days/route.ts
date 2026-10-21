import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { HUNDRED_DAYS } from '@/lib/100-days-data'
import { completedDaysFrom, difficultyTotals, sprintRun } from '@/lib/hundred-days-progress'

export const runtime = 'nodejs'

const LANGS = new Set(Object.keys(HUNDRED_DAYS[0]?.problems[0]?.starterCode ?? { python: '' }))

/**
 * GET — the user's 100-day sprint progress.
 * Progress comes from problems the server graded as accepted
 * (`solvedProblems`, written by /api/arena/run). `legacyDays` holds days saved
 * by older clients before server grading existed; they still count as done so
 * nobody loses progress, but nothing new is written there.
 */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  try {
    const db = await getMongoDb()
    const doc = await db.collection('user_100days_progress').findOne({ userId: user.id })
    const solved: string[] = Array.isArray(doc?.solvedProblems) ? doc!.solvedProblems.filter((x: unknown) => typeof x === 'string') : []
    const legacy: number[] = Array.isArray(doc?.completedDays)
      ? doc!.completedDays.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 100)
      : []
    const completedDays = [...new Set([...completedDaysFrom(solved, HUNDRED_DAYS), ...legacy])].sort((a, b) => a - b)
    const totals = difficultyTotals(solved, HUNDRED_DAYS)

    return NextResponse.json({
      completedDays,
      solvedProblems: solved,
      currentDay: Math.min(100, sprintRun(completedDays) + 1),
      streak: sprintRun(completedDays),
      totalProblemsSolved: totals.all.solved,
      totals,
      language: typeof doc?.language === 'string' ? doc.language : 'python',
    })
  } catch (e) {
    console.error('[100-days] Load error:', e)
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 })
  }
}

/** POST — save preferences only (`language`). Progress is recorded by the grader. */
export async function POST(request: Request) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

  let body: { language?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const language = typeof body.language === 'string' ? body.language : ''
  if (!LANGS.has(language)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    await db.collection('user_100days_progress').updateOne(
      { userId: user.id },
      { $set: { language, updatedAt: new Date().toISOString() } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[100-days] Save error:', e)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}
