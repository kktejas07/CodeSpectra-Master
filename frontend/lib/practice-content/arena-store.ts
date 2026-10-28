/**
 * Insert helpers for generated practice content. Takes a raw Collection so the
 * same code runs inside the app (cron route) and in `scripts/backfill-arena.ts`
 * under plain tsx — no Next-only imports here.
 */
import type { Collection } from 'mongodb'
import { ARENA_COLLECTION, type ArenaChallenge } from '@/lib/arena-challenges'

export { ARENA_COLLECTION }
/**
 * Store a challenge that already passed `verifyArenaChallenge`. Deduped by id,
 * slug and title so a re-run of the backfill tops up instead of duplicating.
 * Returns 'duplicate' when an equivalent challenge is already present.
 */
export async function insertVerifiedArenaChallenge(
  col: Collection,
  challenge: ArenaChallenge,
): Promise<'inserted' | 'duplicate'> {
  const existing = await col.findOne({
    $or: [
      { id: challenge.id },
      { slug: challenge.slug ?? challenge.id },
      { title: challenge.title },
    ],
  })
  if (existing) return 'duplicate'

  await col.insertOne({
    ...challenge,
    source: 'ai',
    published: true,
    createdAt: new Date().toISOString(),
  })
  return 'inserted'
}

/** How many AI-generated arena challenges already exist. */
export async function countGeneratedArena(col: Collection): Promise<number> {
  return col.countDocuments({ source: 'ai' })
}
