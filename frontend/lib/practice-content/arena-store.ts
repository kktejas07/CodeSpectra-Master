/**
 * Insert helpers for generated practice content. Takes a raw Collection so the
 * same code runs inside the app (cron route) and in `scripts/backfill-arena.ts`
 * under plain tsx — no Next-only imports here.
 */
import type { Db } from 'mongodb'
import { ARENA_COLLECTION, type ArenaChallenge } from '@/lib/arena-challenges'
import { findTitleOwner } from './uniqueness'

export { ARENA_COLLECTION }
/**
 * Store a challenge that already passed `verifyArenaChallenge`. Deduped by id,
 * slug and title so a re-run of the backfill tops up instead of duplicating.
 * Returns 'duplicate' when an equivalent challenge is already present.
 */
export async function insertVerifiedArenaChallenge(
  db: Db,
  challenge: ArenaChallenge,
): Promise<'inserted' | 'duplicate'> {
  const col = db.collection(ARENA_COLLECTION)
  const existing = await col.findOne({
    $or: [
      { id: challenge.id },
      { slug: challenge.slug ?? challenge.id },
      { title: challenge.title },
    ],
  })
  if (existing) return 'duplicate'
  // Same question must not appear on another practice page.
  if (await findTitleOwner(db, challenge.title)) return 'duplicate'

  await col.insertOne({
    ...challenge,
    source: 'ai',
    published: true,
    createdAt: new Date().toISOString(),
  })
  return 'inserted'
}

/** How many AI-generated arena challenges already exist. */
export async function countGeneratedArena(db: Db): Promise<number> {
  return db.collection(ARENA_COLLECTION).countDocuments({ source: 'ai' })
}
