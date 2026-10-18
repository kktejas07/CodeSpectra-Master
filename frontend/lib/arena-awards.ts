/**
 * Arena variants + point awards (server only). The rule itself is pure and
 * tested in lib/arena-points.ts; this file stores and enforces it.
 *
 *  - `arena_variants`: an AI rewrite served to one user, with the tests the
 *    server will grade it on and the ORIGINAL question id it maps back to.
 *    Expires after 7 days (TTL).
 *  - `arena_point_awards`: one claim per (user, original question) — unique
 *    index, so concurrent submits can't award twice. Claims also carry the UTC
 *    day for the daily cap. The XP itself goes to `xp_events` (reason
 *    `arena_solved`) so it feeds the leaderboard.
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ai'
import { awardXpWithLevelUp } from '@/lib/xp-service'
import { getArenaChallenge } from '@/lib/arena-challenges'
import {
  ARENA_DAILY_POINT_CAP,
  ARENA_XP_REASON,
  decideArenaAward,
  utcDayKey,
  type ArenaAwardReason,
} from '@/lib/arena-points'

const VARIANT_TTL_SEC = 7 * 24 * 60 * 60

export interface ArenaVariantDoc {
  id: string
  user_id: string
  original_id: string
  examples: { input: string; output: string }[]
  created_at: string
  expires_at: Date
}

export interface ArenaAwardDoc {
  id: string
  user_id: string
  original_id: string
  variant_id: string | null
  day: string
  points: number
  created_at: string
}

let variantsIndexed: Promise<unknown> | null = null
async function arenaVariants(): Promise<Collection<ArenaVariantDoc>> {
  const col = (await getMongoDb()).collection<ArenaVariantDoc>('arena_variants')
  if (!variantsIndexed) {
    variantsIndexed = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'arena_variants_id' }),
      col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'arena_variants_ttl' }),
    ]).catch((e) => {
      variantsIndexed = null
      console.error('[arena] variant index build failed', e)
    })
  }
  await variantsIndexed
  return col
}

let awardsIndexed: Promise<unknown> | null = null
async function arenaAwards(): Promise<Collection<ArenaAwardDoc>> {
  const col = (await getMongoDb()).collection<ArenaAwardDoc>('arena_point_awards')
  if (!awardsIndexed) {
    awardsIndexed = Promise.all([
      col.createIndex({ user_id: 1, original_id: 1 }, { unique: true, name: 'arena_awards_once_per_question' }),
      col.createIndex({ user_id: 1, day: 1 }, { name: 'arena_awards_user_day' }),
    ]).catch((e) => {
      awardsIndexed = null
      console.error('[arena] award index build failed', e)
    })
  }
  await awardsIndexed
  return col
}

/** Store the tests of an AI variant served to this user; returns its id. */
export async function saveArenaVariant(userId: string, originalId: string, examples: { input: string; output: string }[]): Promise<string> {
  const id = newId()
  await (await arenaVariants()).insertOne({
    id,
    user_id: userId,
    original_id: originalId,
    examples: examples.slice(0, 20).map((e) => ({ input: String(e.input).slice(0, 10_000), output: String(e.output).slice(0, 10_000) })),
    created_at: nowIso(),
    expires_at: new Date(Date.now() + VARIANT_TTL_SEC * 1000),
  })
  return id
}

/** The caller's own variant, or null (missing, expired or someone else's). */
export async function loadArenaVariant(userId: string, variantId: string): Promise<ArenaVariantDoc | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(variantId)) return null
  return (await arenaVariants()).findOne({ id: variantId, user_id: userId }, { projection: { _id: 0 } })
}

async function pointsOnDay(col: Collection<ArenaAwardDoc>, userId: string, day: string): Promise<number> {
  const agg = await col
    .aggregate<{ total: number }>([{ $match: { user_id: userId, day } }, { $group: { _id: null, total: { $sum: '$points' } } }])
    .toArray()
  return agg[0]?.total ?? 0
}

export interface ArenaAwardResult {
  points: number
  reason: ArenaAwardReason
  earned_today: number
  daily_cap: number
}

/**
 * Award arena points for a server-graded result on ORIGINAL question
 * `originalId`. Safe to call on every submit; never awards twice.
 */
export async function awardArenaPoints(args: {
  userId: string
  originalId: string
  variantId: string | null
  accepted: boolean
  now?: Date
}): Promise<ArenaAwardResult> {
  const now = args.now ?? new Date()
  const day = utcDayKey(now)
  const original = getArenaChallenge(args.originalId)
  const col = await arenaAwards()

  const [existing, earnedToday] = await Promise.all([
    col.findOne({ user_id: args.userId, original_id: args.originalId }, { projection: { _id: 0, id: 1 } }),
    pointsOnDay(col, args.userId, day),
  ])
  const decision = decideArenaAward({
    accepted: args.accepted,
    difficulty: original?.difficulty,
    alreadyEarned: Boolean(existing),
    earnedToday,
  })
  const result = (points: number, reason: ArenaAwardReason, today: number): ArenaAwardResult =>
    ({ points, reason, earned_today: today, daily_cap: ARENA_DAILY_POINT_CAP })
  if (decision.reason !== 'awarded') return result(0, decision.reason, earnedToday)

  const claim: ArenaAwardDoc = {
    id: newId(),
    user_id: args.userId,
    original_id: args.originalId,
    variant_id: args.variantId,
    day,
    points: decision.points,
    created_at: now.toISOString(),
  }
  try {
    await col.insertOne({ ...claim })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return result(0, 'already_earned', earnedToday)
    throw e
  }

  // A concurrent award may have landed between the check and the claim.
  const after = await pointsOnDay(col, args.userId, day)
  if (after > ARENA_DAILY_POINT_CAP) {
    await col.deleteOne({ id: claim.id })
    return result(0, 'daily_cap', after - claim.points)
  }

  try {
    await awardXpWithLevelUp({
      userId: args.userId,
      amount: claim.points,
      reason: ARENA_XP_REASON,
      submissionId: `arena:${claim.id}`,
      metadata: { source: 'arena', original_id: args.originalId, variant_id: args.variantId, difficulty: original?.difficulty },
    })
  } catch (e) {
    // Release the claim so the next accepted submit can earn it.
    await col.deleteOne({ id: claim.id }).catch(() => {})
    throw e
  }
  return result(claim.points, 'awarded', after)
}
