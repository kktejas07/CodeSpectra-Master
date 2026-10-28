/**
 * Cron: add ONE verified arena challenge per day.
 * POST /api/cron/practice-daily  (Authorization: Bearer CRON_SECRET)
 *
 * A candidate is published only when its reference solution reproduces every
 * expected output in the sandbox (lib/practice-content/arena-generate.ts), so
 * an unattended run can never add an unsolvable challenge.
 *
 * Scheduled through lib/platform-cron.ts → runs from the in-process scheduler
 * and /api/cron/tick, with the per-window lease preventing double generation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/cron-heartbeat'
import { withCronWindow } from '@/lib/automation/job-lease'
import { getMongoDb } from '@/lib/mongodb'
import { ARENA_COLLECTION } from '@/lib/arena-challenges'
import { generateArenaChallenge } from '@/lib/practice-content/arena-generate'
import { insertVerifiedArenaChallenge } from '@/lib/practice-content/arena-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function postImpl(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  // One challenge per UTC day, whatever triggers us (scheduler + tick + manual).
  const dayKey = new Date().toISOString().slice(0, 10)
  const db = await getMongoDb()
  const col = db.collection(ARENA_COLLECTION)
  const already = await col.findOne({ source: 'ai', createdAt: { $gte: `${dayKey}T00:00:00.000Z` } })
  if (already) {
    return NextResponse.json({ ok: true, skipped: 'already_today', id: already.id })
  }

  const categories = ['Arrays', 'Strings', 'Hash Maps', 'Two Pointers', 'Stacks', 'Graphs', 'Dynamic Programming', 'Binary Search', 'Trees']
  const difficulties = ['easy', 'medium', 'hard']
  const seed = dayKey.split('-').reduce((n, p) => n + Number(p), 0)
  const result = await generateArenaChallenge({
    category: categories[seed % categories.length],
    difficulty: difficulties[seed % difficulties.length],
    feature: 'practice-content-daily',
  })

  if (!result.ok) {
    // Nothing is written on failure — a missed day is better than a bad one.
    return NextResponse.json({ ok: false, error: result.reason, attempts: result.attempts }, { status: 502 })
  }

  const inserted = await insertVerifiedArenaChallenge(col, result.challenge)
  return NextResponse.json({
    ok: true,
    id: result.challenge.id,
    title: result.challenge.title,
    attempts: result.attempts,
    inserted,
  })
}

export const POST = withCronWindow('practice-daily', 1440, withCronHeartbeat('practice-daily', postImpl))

export async function GET(req: NextRequest) {
  return POST(req)
}
