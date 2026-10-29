/**
 * Cron: add practice content that provably works — one arena challenge and one
 * coding problem per day.
 * POST /api/cron/practice-daily  (Authorization: Bearer CRON_SECRET)
 *
 * Both are published only when their reference solution reproduces every
 * expected output in the sandbox (lib/practice-content/*), so an unattended run
 * can never add unsolvable content. Nothing is written for a failed item — a
 * missed day beats a broken one.
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
import { generateVerifiedProblem, systemPracticeUser } from '@/lib/practice-content/problems-generate'
import { generateChallenge, CHALLENGE_TYPES } from '@/lib/practice-content/challenges-generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CATEGORIES = ['Arrays', 'Strings', 'Hash Maps', 'Two Pointers', 'Stacks', 'Graphs', 'Dynamic Programming', 'Binary Search', 'Trees']
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

type ItemResult = { ok: boolean; id?: string; title?: string; reason?: string; skipped?: string }

async function postImpl(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }

  const dayKey = new Date().toISOString().slice(0, 10)
  const dayStart = `${dayKey}T00:00:00.000Z`
  const db = await getMongoDb()
  // Deterministic rotation, so a given day always targets the same topic.
  const seed = dayKey.split('-').reduce((n, p) => n + Number(p), 0)
  const category = CATEGORIES[seed % CATEGORIES.length]
  const difficulty = DIFFICULTIES[seed % DIFFICULTIES.length]

  // --- arena challenge ---
  let arena: ItemResult
  const arenaCol = db.collection(ARENA_COLLECTION)
  const arenaToday = await arenaCol.findOne({ source: 'ai', createdAt: { $gte: dayStart } })
  if (arenaToday) {
    arena = { ok: true, skipped: 'already_today', id: arenaToday.id }
  } else {
    const gen = await generateArenaChallenge({ category, difficulty, feature: 'practice-content-daily' })
    if (!gen.ok) {
      arena = { ok: false, reason: gen.reason }
    } else {
      const inserted = await insertVerifiedArenaChallenge(arenaCol, gen.challenge)
      arena = { ok: true, id: gen.challenge.id, title: gen.challenge.title, skipped: inserted === 'duplicate' ? 'duplicate' : undefined }
    }
  }

  // --- coding problem ---
  let problem: ItemResult
  const problemToday = await db.collection('problems').findOne({ source: 'ai_agent', created_at: { $gte: dayStart } })
  if (problemToday) {
    problem = { ok: true, skipped: 'already_today', id: String(problemToday.id ?? problemToday.slug ?? '') }
  } else {
    try {
      const gen = await generateVerifiedProblem({
        user: systemPracticeUser(),
        difficulty,
        topics: [category],
      })
      problem = gen.ok ? { ok: true, id: gen.id, title: gen.slug } : { ok: false, reason: gen.reason }
    } catch (e) {
      problem = { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  // --- challenge draft (prose: waits for a human at /dashboard/admin/practice-review) ---
  let challenge: ItemResult
  const challengeToday = await db.collection('challenges').findOne({ source: 'ai', created_at: { $gte: dayStart } })
  if (challengeToday) {
    challenge = { ok: true, skipped: 'already_today', id: String(challengeToday.id ?? '') }
  } else {
    try {
      const gen = await generateChallenge({
        type: CHALLENGE_TYPES[seed % CHALLENGE_TYPES.length],
        difficulty,
      })
      if (!gen.ok) {
        challenge = { ok: false, reason: gen.reason }
      } else {
        const c = gen.challenge
        const exists = await db.collection('challenges').findOne({ $or: [{ id: c.id }, { slug: c.slug }, { title: c.title }] })
        if (exists) {
          challenge = { ok: true, skipped: 'duplicate', id: exists.id }
        } else {
          const now = new Date().toISOString()
          await db.collection('challenges').insertOne({ ...c, created_at: now, updated_at: now })
          challenge = { ok: true, id: c.id, title: c.title }
        }
      }
    } catch (e) {
      challenge = { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  const ok = arena.ok || problem.ok || challenge.ok
  return NextResponse.json(
    { ok, day: dayKey, arena, problem, challenge },
    { status: ok ? 200 : 502 },
  )
}

export const POST = withCronWindow('practice-daily', 1440, withCronHeartbeat('practice-daily', postImpl))

export async function GET(req: NextRequest) {
  return POST(req)
}
